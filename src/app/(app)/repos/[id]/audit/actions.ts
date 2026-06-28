"use server";

import { revalidatePath } from "next/cache";

import { getSessionUser } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { enqueueAudit } from "@/server/jobs/enqueue";
import { isLlmAdmin } from "@/server/llm/admin";
import { getProviderKeySummaries } from "@/server/llm/keys";
import { PROVIDERS } from "@/server/llm/providers";
import { briefError } from "@/server/log";

/** Result of {@link requestAudit}, surfaced inline in the run form. */
export type AuditRequestState = { ok: boolean; message: string };

/** Server action: queue an LLM audit of a repo's agent/hook config. Gated to LLM admins (it spends
 *  tokens) and requires explicit consent (it sends the repo's config files to the provider). Creates
 *  a pending RepoAudit and enqueues the worker job; the result appears on reload. */
export async function requestAudit(
  _prev: AuditRequestState,
  formData: FormData,
): Promise<AuditRequestState> {
  const user = await getSessionUser();
  if (!user) return { ok: false, message: "Not signed in." };
  if (!isLlmAdmin(user.login)) return { ok: false, message: "Only an LLM admin can run audits." };

  const repoId = String(formData.get("repoId") ?? "");
  const consent = formData.get("consent");
  if (!repoId) return { ok: false, message: "Missing repository." };
  if (consent !== "on" && consent !== "true") {
    return { ok: false, message: "Please confirm sending this repo's config to the provider." };
  }

  const repo = await prisma.repo.findUnique({ where: { id: repoId } });
  if (!repo) return { ok: false, message: "Repository not found." };

  const anthropic = (await getProviderKeySummaries()).find((s) => s.provider === "anthropic");
  if (!anthropic?.configured || anthropic.status !== "valid") {
    return {
      ok: false,
      message: "Configure a valid Anthropic key in Settings → AI providers first.",
    };
  }
  const model = anthropic.selectedModel ?? PROVIDERS.anthropic.defaultModel;

  try {
    const audit = await prisma.repoAudit.create({
      data: { repoId, provider: "anthropic", model, status: "pending", triggeredByLogin: user.login },
    });
    const enqueued = await enqueueAudit(audit.id);
    if (!enqueued) {
      // No DB/queue available — don't leave a row stuck "pending" or falsely report success.
      await prisma.repoAudit.update({
        where: { id: audit.id },
        data: { status: "failed", error: "No queue configured to run the audit.", completedAt: new Date() },
      });
      return { ok: false, message: "Could not queue the audit — no queue configured." };
    }
    revalidatePath(`/repos/${repoId}/audit`);
    return { ok: true, message: "Audit queued — reload in a moment to see the result." };
  } catch (error) {
    console.warn("requestAudit failed", briefError(error));
    return { ok: false, message: "Could not queue the audit — please try again." };
  }
}
