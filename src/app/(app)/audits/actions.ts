"use server";

import { revalidatePath } from "next/cache";

import { getSessionUser } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { enqueueAudit, enqueueBatchEstimate } from "@/server/jobs/enqueue";
import { computeBatchProgress, isBatchComplete } from "@/server/llm/audit-batch";
import { isLlmAdmin } from "@/server/llm/admin";
import { getProviderKeySummaries } from "@/server/llm/keys";
import { PROVIDERS } from "@/server/llm/providers";
import { briefError } from "@/server/log";

type Gate = { ok: true; login: string } | { ok: false; message: string };

/** Shared gate for batch actions: signed-in LLM admin with a usable (valid|rate_limited) key. */
async function auditGate(): Promise<Gate> {
  const user = await getSessionUser();
  if (!user) return { ok: false, message: "Not signed in." };
  if (!isLlmAdmin(user.login)) return { ok: false, message: "Only an LLM admin can run audits." };
  const anthropic = (await getProviderKeySummaries()).find((s) => s.provider === "anthropic");
  if (!anthropic?.configured || (anthropic.status !== "valid" && anthropic.status !== "rate_limited")) {
    return { ok: false, message: "Configure a valid Anthropic key in Settings → AI providers first." };
  }
  return { ok: true, login: user.login };
}

/** Result of {@link startBatchEstimate}. */
export type BatchStartState = { ok: boolean; message: string; batchId?: string };

/** Create an AuditBatch for the selected repos and enqueue the estimate job. One active batch at a time. */
export async function startBatchEstimate(repoIds: string[], force: boolean): Promise<BatchStartState> {
  const gate = await auditGate();
  if (!gate.ok) return { ok: false, message: gate.message };
  const ids = Array.from(new Set(repoIds)).filter(Boolean);
  if (ids.length === 0) return { ok: false, message: "Select at least one repository." };
  const active = await prisma.auditBatch.findFirst({
    where: { status: { in: ["estimating", "running"] } },
    select: { id: true },
  });
  if (active) return { ok: false, message: "A batch is already running — wait for it to finish." };
  const repos = await prisma.repo.findMany({ where: { id: { in: ids } }, select: { id: true } });
  if (repos.length === 0) return { ok: false, message: "No matching repositories." };

  let batchId: string | null = null;
  try {
    const batch = await prisma.auditBatch.create({
      data: {
        status: "estimating",
        triggeredByLogin: gate.login,
        force,
        repoCount: repos.length,
        items: { create: repos.map((r) => ({ repoId: r.id })) },
      },
    });
    batchId = batch.id;
    if (!(await enqueueBatchEstimate(batch.id))) throw new Error("No queue configured.");
    revalidatePath("/audits");
    return { ok: true, message: "Estimating…", batchId: batch.id };
  } catch (error) {
    if (batchId) {
      await prisma.auditBatch
        .update({ where: { id: batchId }, data: { status: "failed", error: "Could not enqueue." } })
        .catch(() => {});
    }
    console.warn("startBatchEstimate failed", briefError(error));
    return { ok: false, message: "Could not start the batch — please try again." };
  }
}

/** Confirm an estimated batch: create + enqueue a RepoAudit per `will_audit` item (dedup repos already
 *  pending/running). Idempotent once running/completed. */
export async function confirmBatch(batchId: string): Promise<{ ok: boolean; message: string }> {
  const gate = await auditGate();
  if (!gate.ok) return { ok: false, message: gate.message };
  const batch = await prisma.auditBatch.findUnique({
    where: { id: batchId },
    include: { items: { where: { decision: "will_audit" } } },
  });
  if (!batch) return { ok: false, message: "Batch not found." };
  if (batch.status === "running" || batch.status === "completed") return { ok: true, message: "Batch already confirmed." };
  if (batch.status !== "estimated") return { ok: false, message: "Batch is not ready to confirm." };

  const model = PROVIDERS.anthropic.defaultModel;
  for (const item of batch.items) {
    const existing = await prisma.repoAudit.findFirst({
      where: { repoId: item.repoId, status: { in: ["pending", "running"] } },
      select: { id: true },
    });
    if (existing) continue;
    let auditId: string | null = null;
    try {
      const audit = await prisma.repoAudit.create({
        data: { repoId: item.repoId, provider: "anthropic", model, status: "pending", triggeredByLogin: gate.login },
      });
      auditId = audit.id;
      await prisma.auditBatchItem.update({ where: { id: item.id }, data: { auditId: audit.id } });
      if (!(await enqueueAudit(audit.id))) throw new Error("No queue configured.");
    } catch (error) {
      if (auditId) {
        await prisma.repoAudit
          .update({ where: { id: auditId }, data: { status: "failed", error: "Could not enqueue.", completedAt: new Date() } })
          .catch(() => {});
      }
      await prisma.auditBatchItem
        .update({ where: { id: item.id }, data: { decision: "error", error: briefError(error).message } })
        .catch(() => {});
    }
  }
  await prisma.auditBatch.update({ where: { id: batchId }, data: { status: "running", confirmedAt: new Date() } });
  revalidatePath("/audits");
  return { ok: true, message: "Audits queued." };
}

/** Cancel an estimated (not-yet-confirmed) batch. */
export async function cancelBatch(batchId: string): Promise<{ ok: boolean; message: string }> {
  const gate = await auditGate();
  if (!gate.ok) return { ok: false, message: gate.message };
  const res = await prisma.auditBatch.updateMany({
    where: { id: batchId, status: "estimated" },
    data: { status: "cancelled" },
  });
  revalidatePath("/audits");
  return res.count > 0
    ? { ok: true, message: "Batch cancelled." }
    : { ok: false, message: "Only an estimated batch can be cancelled." };
}

/** One repo row in a batch view. */
export type BatchItemView = {
  repoId: string;
  nameWithOwner: string;
  decision: string;
  estimatedUsd: number | null;
  error: string | null;
  auditStatus: string | null;
};

/** Snapshot of a batch for the client panel (polled). */
export type BatchView = {
  id: string;
  status: string;
  totalEstimatedUsd: number | null;
  auditCount: number | null;
  skippedCount: number | null;
  progress: { total: number; completed: number; failed: number; running: number; pending: number };
  items: BatchItemView[];
};

/** Read a batch + items for polling; lazily flips a fully-terminal running batch to completed. */
export async function getBatchState(batchId: string): Promise<BatchView | null> {
  const batch = await prisma.auditBatch.findUnique({
    where: { id: batchId },
    include: {
      items: {
        include: { repo: { select: { nameWithOwner: true } }, audit: { select: { status: true } } },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!batch) return null;
  const statuses = batch.items.map((i) => i.audit?.status).filter((s): s is string => Boolean(s));
  let status = batch.status;
  // A running batch with no active (pending|running) linked audits is complete —
  // covers all runs terminal AND the edge where no audit was created (all errored / zero will_audit).
  if (status === "running" && isBatchComplete(statuses)) {
    await prisma.auditBatch
      .update({ where: { id: batchId }, data: { status: "completed", completedAt: new Date() } })
      .catch(() => {});
    status = "completed";
  }
  return {
    id: batch.id,
    status,
    totalEstimatedUsd: batch.totalEstimatedUsd ? Number(batch.totalEstimatedUsd) : null,
    auditCount: batch.auditCount,
    skippedCount: batch.skippedCount,
    progress: computeBatchProgress(statuses),
    items: batch.items.map((i) => ({
      repoId: i.repoId,
      nameWithOwner: i.repo.nameWithOwner,
      decision: i.decision,
      estimatedUsd: i.estimatedUsd ? Number(i.estimatedUsd) : null,
      error: i.error,
      auditStatus: i.audit?.status ?? null,
    })),
  };
}
