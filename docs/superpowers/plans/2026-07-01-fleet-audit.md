# Fleet-Audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `/audits` fleet overview across all managed repos plus a batch flow (estimate → confirm → run) that reuses the single-repo audit engine.

**Architecture:** Persisted `AuditBatch` + `AuditBatchItem`; a new graphile-worker task `audit:estimate` computes an exact per-repo cost estimate (skipping repos whose default-branch commit is unchanged), the UI confirms, then one `RepoAudit` + `audit:run` is enqueued per repo. `runAudit()` is unchanged; pure decision/aggregation logic is extracted for unit testing.

**Tech Stack:** Next.js 16 (App Router, RSC + server actions), React 19, TypeScript strict, Prisma 6 + Postgres, graphile-worker, TanStack Table, shadcn/ui + shadcnstudio (`@ss-blocks`), Vitest, pnpm.

Design spec: `docs/superpowers/specs/2026-07-01-fleet-audit-design.md`.

## Global Constraints

- Branch `feature/fleet-audit`; feature-branch → PR → CodeRabbit loop; PR links `Closes #<issue>`.
- Code/comments/commits in **English**; commit style = Conventional Commits.
- **TDD** for pure logic; run tests before/after each change. Repo testing philosophy: **unit-test pure functions; verify IO orchestration (prisma/network/worker/server-actions) by typecheck + build + e2e** (mirrors `audit.ts`, where only `estimateUsd`/`validateFindings` are unit-tested).
- **Docstring coverage ≥ 80%** (`pnpm docstring:coverage`) — every new exported symbol gets a docstring.
- Per-repo cost cap `ORCHID_AUDIT_MAX_USD` stays enforced in `runAudit()` (unchanged); the batch guard is the exact estimate + confirm. No separate fleet ceiling.
- **UI = shadcn/ui + shadcnstudio only.** Files under `src/app/(app)/audits/**` and new audit components import UI only from `@/components/ui/*`, `@/components/data-table`, `lucide-react`. No custom stylesheets/`<style>`, no `recharts`.
- Commands: `pnpm test` (Vitest), `pnpm check` (lint+typecheck), `pnpm build`, `pnpm prisma:dev` (migrate dev).
- Shell: shadcnstudio installs need `EMAIL` + `LICENSE_KEY` exported (present in the repo `.env`); run `pnpm dlx shadcn@latest ...` from the repo root.

---

### Task 1: Prisma models `AuditBatch` + `AuditBatchItem`

**Files:**
- Modify: `prisma/schema.prisma` (add two models + back-relations on `Repo` and `RepoAudit`)
- Create: `prisma/migrations/<generated>/migration.sql` (via the CLI)

**Interfaces:**
- Produces: Prisma models `AuditBatch`, `AuditBatchItem` and the generated client types used by every later task. `AuditBatch.status` ∈ `estimating|estimated|running|completed|cancelled|failed`; `AuditBatch.force: boolean`; `AuditBatchItem.decision` ∈ `pending|will_audit|skip_unchanged|skip_no_config|error`; `AuditBatchItem.auditId` is unique and nullable.

> **Refinement vs spec §3:** adds `force Boolean @default(false)` to `AuditBatch` (the estimate worker needs the force flag). Update the spec's model block to match.

- [ ] **Step 1: Add the models + relations to `prisma/schema.prisma`**

Append these models and add the two back-relation fields to the existing `Repo` and `RepoAudit` models (`Repo` gets `auditBatchItems AuditBatchItem[]`; `RepoAudit` gets `batchItem AuditBatchItem?`):

```prisma
model AuditBatch {
  id                        String           @id @default(cuid())
  status                    String           @default("estimating") // estimating | estimated | running | completed | cancelled | failed
  force                     Boolean          @default(false) // re-audit even if the commit is unchanged
  triggeredByLogin          String?
  totalEstimatedUsd         Decimal?         @db.Decimal(10, 4)
  totalEstimatedInputTokens Int?
  repoCount                 Int
  auditCount                Int?
  skippedCount              Int?
  error                     String?
  items                     AuditBatchItem[]
  createdAt                 DateTime         @default(now())
  estimatedAt               DateTime?
  confirmedAt               DateTime?
  completedAt               DateTime?

  @@index([status])
}

model AuditBatchItem {
  id                   String     @id @default(cuid())
  batch                AuditBatch @relation(fields: [batchId], references: [id], onDelete: Cascade)
  batchId              String
  repo                 Repo       @relation(fields: [repoId], references: [id], onDelete: Cascade)
  repoId               String
  decision             String     @default("pending") // pending | will_audit | skip_unchanged | skip_no_config | error
  estimatedInputTokens Int?
  estimatedUsd         Decimal?   @db.Decimal(10, 4)
  commitSha            String?
  lastAuditCommitSha   String?
  error                String?
  audit                RepoAudit? @relation(fields: [auditId], references: [id], onDelete: SetNull)
  auditId              String?    @unique
  createdAt            DateTime   @default(now())

  @@unique([batchId, repoId])
  @@index([batchId])
}
```

- [ ] **Step 2: Create + apply the migration**

Run: `pnpm prisma:dev --name fleet_audit_batches` (alias for `prisma migrate dev`)
Expected: a new migration under `prisma/migrations/` and "Your database is now in sync with your schema."

- [ ] **Step 3: Regenerate the client + typecheck**

Run: `pnpm prisma:generate && pnpm typecheck`
Expected: no errors; `AuditBatch`/`AuditBatchItem` available on `prisma`.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(audits): add AuditBatch + AuditBatchItem models"
```

---

### Task 2: Pure batch logic (`audit-batch.ts`)

**Files:**
- Create: `src/server/llm/audit-batch.ts`
- Test: `src/server/llm/audit-batch.test.ts`

**Interfaces:**
- Produces: `type ItemDecision`; `decideStaleness({force, currentSha, lastCompletedSha}): "will_audit" | "skip_unchanged"`; `aggregateEstimate(items): {totalEstimatedUsd, totalEstimatedInputTokens, auditCount, skippedCount}`; `isBatchComplete(statuses: string[]): boolean`; `computeBatchProgress(statuses: string[]): {total, completed, failed, running, pending}`; `summarizeFleet(rows): {totalRepos, auditedRepos, averageScore, openFindings}`.

- [ ] **Step 1: Write the failing tests**

```ts
// src/server/llm/audit-batch.test.ts
import { describe, expect, it } from "vitest";
import {
  aggregateEstimate,
  computeBatchProgress,
  decideStaleness,
  isBatchComplete,
  summarizeFleet,
} from "./audit-batch";

describe("decideStaleness", () => {
  it("skips when the commit is unchanged since the last completed audit", () => {
    expect(decideStaleness({ force: false, currentSha: "a", lastCompletedSha: "a" })).toBe("skip_unchanged");
  });
  it("audits when the commit changed", () => {
    expect(decideStaleness({ force: false, currentSha: "b", lastCompletedSha: "a" })).toBe("will_audit");
  });
  it("audits when never audited", () => {
    expect(decideStaleness({ force: false, currentSha: "a", lastCompletedSha: null })).toBe("will_audit");
  });
  it("force overrides an unchanged commit", () => {
    expect(decideStaleness({ force: true, currentSha: "a", lastCompletedSha: "a" })).toBe("will_audit");
  });
});

describe("aggregateEstimate", () => {
  it("sums cost/tokens over will_audit items and counts the rest as skipped", () => {
    const totals = aggregateEstimate([
      { decision: "will_audit", estimatedUsd: 0.1, estimatedInputTokens: 1000 },
      { decision: "will_audit", estimatedUsd: 0.2, estimatedInputTokens: 2000 },
      { decision: "skip_unchanged", estimatedUsd: 0, estimatedInputTokens: 0 },
      { decision: "error", estimatedUsd: null, estimatedInputTokens: null },
    ]);
    expect(totals).toEqual({
      totalEstimatedUsd: 0.30000000000000004,
      totalEstimatedInputTokens: 3000,
      auditCount: 2,
      skippedCount: 2,
    });
  });
});

describe("isBatchComplete / computeBatchProgress", () => {
  it("is complete only when all runs are terminal", () => {
    expect(isBatchComplete(["completed", "failed"])).toBe(true);
    expect(isBatchComplete(["completed", "running"])).toBe(false);
    expect(isBatchComplete([])).toBe(true);
  });
  it("counts runs by status", () => {
    expect(computeBatchProgress(["completed", "completed", "failed", "running"])).toEqual({
      total: 4, completed: 2, failed: 1, running: 1, pending: 0,
    });
  });
});

describe("summarizeFleet", () => {
  it("averages scores over audited repos and sums findings", () => {
    expect(
      summarizeFleet([
        { hasAudit: true, score: 80, status: "completed", findingCount: 2 },
        { hasAudit: true, score: 60, status: "completed", findingCount: 3 },
        { hasAudit: false, score: null, status: "", findingCount: 0 },
      ]),
    ).toEqual({ totalRepos: 3, auditedRepos: 2, averageScore: 70, openFindings: 5 });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test src/server/llm/audit-batch.test.ts`
Expected: FAIL — module `./audit-batch` not found.

- [ ] **Step 3: Implement `audit-batch.ts`**

```ts
// src/server/llm/audit-batch.ts
/** The per-item decision made during the estimate phase of a Fleet-Audit batch. */
export type ItemDecision = "pending" | "will_audit" | "skip_unchanged" | "skip_no_config" | "error";

/** Decide whether a repo needs a fresh audit: `force` always audits; otherwise skip only when the
 *  current default-branch head equals the commit the last completed audit ran against. Pure. */
export function decideStaleness(input: {
  force: boolean;
  currentSha: string;
  lastCompletedSha: string | null;
}): "will_audit" | "skip_unchanged" {
  if (input.force) return "will_audit";
  if (input.lastCompletedSha && input.lastCompletedSha === input.currentSha) return "skip_unchanged";
  return "will_audit";
}

/** Minimal batch-item shape for cost aggregation. */
export type EstimatableItem = {
  decision: ItemDecision;
  estimatedUsd: number | null;
  estimatedInputTokens: number | null;
};

/** Sum estimated cost/tokens over `will_audit` items; everything else counts as skipped. Pure. */
export function aggregateEstimate(items: EstimatableItem[]): {
  totalEstimatedUsd: number;
  totalEstimatedInputTokens: number;
  auditCount: number;
  skippedCount: number;
} {
  let totalEstimatedUsd = 0;
  let totalEstimatedInputTokens = 0;
  let auditCount = 0;
  let skippedCount = 0;
  for (const item of items) {
    if (item.decision === "will_audit") {
      auditCount += 1;
      totalEstimatedUsd += item.estimatedUsd ?? 0;
      totalEstimatedInputTokens += item.estimatedInputTokens ?? 0;
    } else {
      skippedCount += 1;
    }
  }
  return { totalEstimatedUsd, totalEstimatedInputTokens, auditCount, skippedCount };
}

const TERMINAL = new Set(["completed", "failed"]);

/** Whether every linked run has reached a terminal state (so the batch is done). Empty = done. Pure. */
export function isBatchComplete(auditStatuses: string[]): boolean {
  return auditStatuses.every((s) => TERMINAL.has(s));
}

/** Count a batch's linked runs by status, for the overview + panel. Pure. */
export function computeBatchProgress(auditStatuses: string[]): {
  total: number;
  completed: number;
  failed: number;
  running: number;
  pending: number;
} {
  const count = (s: string) => auditStatuses.filter((x) => x === s).length;
  return {
    total: auditStatuses.length,
    completed: count("completed"),
    failed: count("failed"),
    running: count("running"),
    pending: count("pending"),
  };
}

/** Fleet-summary header stats derived from each repo's latest audit (null score = never audited). Pure. */
export function summarizeFleet(
  rows: { hasAudit: boolean; score: number | null; status: string; findingCount: number }[],
): { totalRepos: number; auditedRepos: number; averageScore: number | null; openFindings: number } {
  const audited = rows.filter((r) => r.hasAudit);
  const scored = audited.map((r) => r.score).filter((s): s is number => s != null);
  const averageScore = scored.length
    ? Math.round(scored.reduce((a, b) => a + b, 0) / scored.length)
    : null;
  const openFindings = rows.reduce((sum, r) => sum + r.findingCount, 0);
  return { totalRepos: rows.length, auditedRepos: audited.length, averageScore, openFindings };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test src/server/llm/audit-batch.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add src/server/llm/audit-batch.ts src/server/llm/audit-batch.test.ts
git commit -m "feat(audits): pure batch decision + aggregation logic"
```

---

### Task 3: Estimate worker + enqueue + task registration

**Files:**
- Modify: `src/server/llm/audit.ts` (add `export` to `SYSTEM_PROMPT` and `buildContent` — no behavior change)
- Modify: `src/server/llm/context.ts` (add `getDefaultBranchHeadSha`; refactor `collectAuditContext` to use it)
- Create: `src/server/llm/audit-estimate.ts` (`runBatchEstimate`)
- Modify: `src/server/jobs/enqueue.ts` (add `enqueueBatchEstimate`)
- Modify: `src/server/jobs/worker.ts` (register `audit:estimate`)
- Test: `src/server/jobs/enqueue.test.ts` (no-DB path)

**Interfaces:**
- Consumes: `decideStaleness`, `aggregateEstimate`, `ItemDecision` (Task 2); `estimateUsd`, `AUDIT_MAX_OUTPUT_TOKENS`, `SYSTEM_PROMPT`, `buildContent` (audit.ts); `collectAuditContext`, `getDefaultBranchHeadSha` (context.ts); `countInputTokens` (anthropic.ts); `getDecryptedProviderKey` (keys.ts); `PROVIDERS` (providers.ts).
- Produces: `runBatchEstimate(batchId: string): Promise<void>`; `enqueueBatchEstimate(batchId: string): Promise<boolean>`; worker task `audit:estimate`.

- [ ] **Step 1: Export the reused engine pieces (no behavior change)**

In `src/server/llm/audit.ts` change `const SYSTEM_PROMPT` → `export const SYSTEM_PROMPT` and `function buildContent` → `export function buildContent`.

- [ ] **Step 2: Add `getDefaultBranchHeadSha` to `context.ts`**

Add this export and refactor `collectAuditContext` to call it instead of its inline ref request:

```ts
/** Cheaply read a repo's default-branch head SHA (one git/ref call) — used to decide "unchanged since
 *  last audit" before collecting the (more expensive) full config context. */
export async function getDefaultBranchHeadSha(repo: Repo): Promise<string> {
  const { octokit, owner, name, base } = await repoClient(repo);
  const ref = await octokit.request("GET /repos/{owner}/{repo}/git/ref/{ref}", {
    owner,
    repo: name,
    ref: `heads/${base}`,
  });
  return ref.data.object.sha;
}
```

Leave `collectAuditContext` unchanged — it keeps its own single `repoClient` + inline `git/ref` request. Do NOT call `getDefaultBranchHeadSha` from inside it (that would do a second `repoClient` per audit on the hot path). `getDefaultBranchHeadSha` is a standalone helper used only by the estimate worker (`runBatchEstimate`). [Corrected after Task 3 review.]

- [ ] **Step 3: Write the failing enqueue test**

```ts
// src/server/jobs/enqueue.test.ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { enqueueBatchEstimate } from "./enqueue";

describe("enqueueBatchEstimate", () => {
  afterEach(() => vi.unstubAllEnvs());
  it("returns false when no database is configured", async () => {
    vi.stubEnv("DATABASE_URL", "");
    expect(await enqueueBatchEstimate("batch_1")).toBe(false);
  });
});
```

- [ ] **Step 4: Run it to verify it fails**

Run: `pnpm test src/server/jobs/enqueue.test.ts`
Expected: FAIL — `enqueueBatchEstimate` is not exported.

- [ ] **Step 5: Add `enqueueBatchEstimate` to `enqueue.ts`**

```ts
/** Enqueue an `audit:estimate` job for a pending AuditBatch. Coalesced per batch via `jobKey`.
 *  Returns `true` when enqueued, `false` when there is no DB configured. */
export async function enqueueBatchEstimate(batchId: string): Promise<boolean> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) return false;
  await quickAddJob({ connectionString }, "audit:estimate", { batchId }, { jobKey: `batch:estimate:${batchId}` });
  return true;
}
```

- [ ] **Step 6: Implement `runBatchEstimate` in `audit-estimate.ts`**

```ts
// src/server/llm/audit-estimate.ts
import { prisma } from "@/server/db";
import { countInputTokens } from "@/server/llm/anthropic";
import { AUDIT_MAX_OUTPUT_TOKENS, SYSTEM_PROMPT, buildContent, estimateUsd } from "@/server/llm/audit";
import { aggregateEstimate, decideStaleness, type ItemDecision } from "@/server/llm/audit-batch";
import { collectAuditContext, getDefaultBranchHeadSha } from "@/server/llm/context";
import { getDecryptedProviderKey } from "@/server/llm/keys";
import { PROVIDERS } from "@/server/llm/providers";
import { briefError } from "@/server/log";

/** The `audit:estimate` worker task: for each item in a batch, decide skip-vs-audit (by commit) and,
 *  for audits, compute the exact input-token cost via the free preflight — mirroring the per-run cost
 *  basis. Per-item errors are recorded on the item; a fatal error fails the whole batch. Never throws. */
export async function runBatchEstimate(batchId: string): Promise<void> {
  const batch = await prisma.auditBatch.findUnique({
    where: { id: batchId },
    include: { items: { include: { repo: true } } },
  });
  if (!batch || batch.status !== "estimating") return;
  const model = PROVIDERS.anthropic.defaultModel;

  try {
    const apiKey = await getDecryptedProviderKey("anthropic");
    if (!apiKey) throw new Error("No Anthropic key configured.");

    for (const item of batch.items) {
      try {
        const last = await prisma.repoAudit.findFirst({
          where: { repoId: item.repoId, status: "completed" },
          orderBy: { createdAt: "desc" },
          select: { commitSha: true },
        });
        const currentSha = await getDefaultBranchHeadSha(item.repo);
        const decision = decideStaleness({
          force: batch.force,
          currentSha,
          lastCompletedSha: last?.commitSha ?? null,
        });
        if (decision === "skip_unchanged") {
          await prisma.auditBatchItem.update({
            where: { id: item.id },
            data: {
              decision,
              commitSha: currentSha,
              lastAuditCommitSha: last?.commitSha ?? null,
              estimatedUsd: 0,
              estimatedInputTokens: 0,
            },
          });
          continue;
        }
        const { files, omitted } = await collectAuditContext(item.repo);
        if (files.length === 0) {
          await prisma.auditBatchItem.update({
            where: { id: item.id },
            data: { decision: "skip_no_config", commitSha: currentSha },
          });
          continue;
        }
        const hookStates = await prisma.repoHookState.findMany({
          where: { repoId: item.repoId },
          select: { path: true, status: true },
        });
        const content = buildContent(item.repo, files, hookStates, omitted);
        const inputTokens = await countInputTokens(apiKey, model, SYSTEM_PROMPT, content);
        await prisma.auditBatchItem.update({
          where: { id: item.id },
          data: {
            decision: "will_audit",
            commitSha: currentSha,
            estimatedInputTokens: inputTokens,
            estimatedUsd: estimateUsd(model, inputTokens, AUDIT_MAX_OUTPUT_TOKENS),
          },
        });
      } catch (error) {
        await prisma.auditBatchItem
          .update({ where: { id: item.id }, data: { decision: "error", error: briefError(error).message } })
          .catch(() => {});
      }
    }

    const items = await prisma.auditBatchItem.findMany({
      where: { batchId },
      select: { decision: true, estimatedUsd: true, estimatedInputTokens: true },
    });
    const totals = aggregateEstimate(
      items.map((i) => ({
        decision: i.decision as ItemDecision,
        estimatedUsd: i.estimatedUsd ? Number(i.estimatedUsd) : null,
        estimatedInputTokens: i.estimatedInputTokens,
      })),
    );
    await prisma.auditBatch.update({
      where: { id: batchId },
      data: {
        status: "estimated",
        estimatedAt: new Date(),
        totalEstimatedUsd: totals.totalEstimatedUsd,
        totalEstimatedInputTokens: totals.totalEstimatedInputTokens,
        auditCount: totals.auditCount,
        skippedCount: totals.skippedCount,
      },
    });
  } catch (error) {
    await prisma.auditBatch
      .update({ where: { id: batchId }, data: { status: "failed", error: briefError(error).message } })
      .catch(() => {});
  }
}
```

- [ ] **Step 7: Register `audit:estimate` in `worker.ts`**

Add `import { runBatchEstimate } from "@/server/llm/audit-estimate";` and this entry to `taskList` (after `audit:run`):

```ts
"audit:estimate": async (payload) => {
  const { batchId } = (payload ?? {}) as { batchId?: string };
  if (!batchId) throw new Error("audit:estimate job is missing batchId");
  await runBatchEstimate(batchId);
},
```

- [ ] **Step 8: Verify (tests + typecheck)**

Run: `pnpm test src/server/jobs/enqueue.test.ts && pnpm check`
Expected: PASS + no type/lint errors.

- [ ] **Step 9: Commit**

```bash
git add src/server/llm/audit.ts src/server/llm/context.ts src/server/llm/audit-estimate.ts src/server/jobs/enqueue.ts src/server/jobs/enqueue.test.ts src/server/jobs/worker.ts
git commit -m "feat(audits): audit:estimate worker + enqueue + head-sha helper"
```

---

### Task 4: Batch server actions (`audits/actions.ts`)

**Files:**
- Create: `src/app/(app)/audits/actions.ts`

**Interfaces:**
- Consumes: `isLlmAdmin` (admin.ts); `getProviderKeySummaries` (keys.ts); `PROVIDERS` (providers.ts); `enqueueAudit`, `enqueueBatchEstimate` (enqueue.ts); `isBatchComplete`, `computeBatchProgress` (audit-batch.ts).
- Produces: `startBatchEstimate(repoIds, force)`, `confirmBatch(batchId)`, `cancelBatch(batchId)`, `getBatchState(batchId)` and the `BatchView`/`BatchItemView` types consumed by the client panel (Task 8).

> Verified by typecheck + build + e2e (IO orchestration, per the repo philosophy); gating reuses the unit-tested `isLlmAdmin`.

- [ ] **Step 1: Implement the actions**

```ts
// src/app/(app)/audits/actions.ts
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
```

- [ ] **Step 2: Verify (typecheck)**

Run: `pnpm check`
Expected: no type/lint errors.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/audits/actions.ts"
git commit -m "feat(audits): batch server actions (start/confirm/cancel/state)"
```

---

### Task 5: Shared severity/status badge helper + install shadcnstudio blocks

**Files:**
- Create: `src/lib/audit-ui.ts`
- Test: `src/lib/audit-ui.test.ts`
- Modify: `src/app/(app)/repos/[id]/audit/page.tsx` (use the shared helper)
- Add via CLI: `@ss-blocks/statistics-component-03`, `@ss-blocks/empty-state-02` (+ any missing `@/components/ui/*` deps they pull)

**Interfaces:**
- Produces: `severityVariant(severity: string)` and `statusVariant(status: string)` returning a `Badge` variant, reused by the single-repo page and `/audits`.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/audit-ui.test.ts
import { describe, expect, it } from "vitest";
import { severityVariant, statusVariant } from "./audit-ui";

describe("severityVariant", () => {
  it("maps known severities", () => {
    expect(severityVariant("critical")).toBe("destructive");
    expect(severityVariant("medium")).toBe("secondary");
    expect(severityVariant("low")).toBe("outline");
  });
  it("falls back to outline for unknown", () => {
    expect(severityVariant("nope")).toBe("outline");
  });
});

describe("statusVariant", () => {
  it("maps known statuses and falls back to outline", () => {
    expect(statusVariant("completed")).toBe("secondary");
    expect(statusVariant("failed")).toBe("destructive");
    expect(statusVariant("weird")).toBe("outline");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm test src/lib/audit-ui.test.ts`
Expected: FAIL — module `./audit-ui` not found.

- [ ] **Step 3: Implement `src/lib/audit-ui.ts`**

```ts
type BadgeVariant = "destructive" | "secondary" | "outline";

/** Badge variant per finding severity (shared by the single-repo audit page + /audits). */
export const SEVERITY_VARIANT: Record<string, BadgeVariant> = {
  critical: "destructive",
  high: "destructive",
  medium: "secondary",
  low: "outline",
  info: "outline",
};

/** Badge variant per audit run status. */
export const STATUS_VARIANT: Record<string, BadgeVariant> = {
  completed: "secondary",
  failed: "destructive",
  running: "outline",
  pending: "outline",
};

/** Badge variant for a finding severity (falls back to `outline`). */
export function severityVariant(severity: string): BadgeVariant {
  return SEVERITY_VARIANT[severity] ?? "outline";
}

/** Badge variant for an audit run status (falls back to `outline`). */
export function statusVariant(status: string): BadgeVariant {
  return STATUS_VARIANT[status] ?? "outline";
}
```

- [ ] **Step 4: Refactor the single-repo page to use it**

In `src/app/(app)/repos/[id]/audit/page.tsx`: delete the local `SEVERITY_VARIANT` and `STATUS_VARIANT` consts, add `import { severityVariant, statusVariant } from "@/lib/audit-ui";`, and replace `SEVERITY_VARIANT[finding.severity] ?? "outline"` → `severityVariant(finding.severity)` and `STATUS_VARIANT[audit.status] ?? "outline"` → `statusVariant(audit.status)`.

- [ ] **Step 5: Install the shadcnstudio blocks**

Run:
```bash
export EMAIL="$(grep -E '^EMAIL=' .env | head -1 | cut -d= -f2- | tr -d '\"')"
export LICENSE_KEY="$(grep -E '^LICENSE_KEY=' .env | head -1 | cut -d= -f2- | tr -d '\"')"
pnpm dlx shadcn@latest add @ss-blocks/statistics-component-03 @ss-blocks/empty-state-02
```
Then per the shadcn skill: read each added file, rewrite any non-`@/` import aliases to the project's (`@/components/ui/...`), confirm icons are `lucide-react`, remove demo-only content, and delete unused demo files. Verify no `recharts` import was added.

- [ ] **Step 6: Verify + commit**

Run: `pnpm test src/lib/audit-ui.test.ts && pnpm check`
Expected: PASS + no errors.

```bash
git add src/lib/audit-ui.ts src/lib/audit-ui.test.ts "src/app/(app)/repos/[id]/audit/page.tsx" src/components
git commit -m "feat(audits): shared badge helper + install fleet UI blocks"
```

---

### Task 6: `/audits` overview page (read-only) + sidebar + UI-import guard

**Files:**
- Create: `src/app/(app)/audits/page.tsx` (RSC)
- Create: `src/app/(app)/audits/audits-table.tsx` (client — read-only columns for now)
- Create: `src/app/(app)/audits/ui-imports.test.ts` (guard)
- Modify: `src/components/app-sidebar.tsx` (nav entry)

**Interfaces:**
- Consumes: `summarizeFleet` (audit-batch.ts); `severityVariant`, `statusVariant` (audit-ui.ts); `DataTable` (data-table.tsx).
- Produces: `type AuditRow` (used by `audits-table.tsx`), the `/audits` route.

- [ ] **Step 1: Add the nav entry in `app-sidebar.tsx`**

Add `ShieldCheck` to the `lucide-react` import, then add to the `VIEWS` array after the Hooks entry:

```ts
  { href: "/audits", label: "Audits", icon: ShieldCheck },
```

- [ ] **Step 2: Create the read-only table component**

```tsx
// src/app/(app)/audits/audits-table.tsx
"use client";

import type { ColumnDef } from "@tanstack/react-table";

import { DataTable } from "@/components/data-table";
import { Badge } from "@/components/ui/badge";
import { severityVariant, statusVariant } from "@/lib/audit-ui";

/** One repo row on the /audits overview (serializable, built server-side). */
export type AuditRow = {
  id: string;
  nameWithOwner: string;
  auditHref: string;
  status: string; // completed | failed | running | pending | none
  score: number | null;
  worstSeverity: string | null;
  findingCount: number;
  lastRun: string | null; // ISO
  usd: number | null;
};

const columns: ColumnDef<AuditRow>[] = [
  {
    accessorKey: "nameWithOwner",
    header: "Repository",
    cell: ({ row }) => (
      <a href={row.original.auditHref} className="font-medium hover:underline">
        {row.getValue("nameWithOwner")}
      </a>
    ),
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) =>
      row.original.status === "none" ? (
        <span className="text-muted-foreground">—</span>
      ) : (
        <Badge variant={statusVariant(row.original.status)}>{row.original.status}</Badge>
      ),
  },
  {
    accessorKey: "score",
    header: "Score",
    cell: ({ row }) => (row.original.score == null ? "—" : `${row.original.score}/100`),
  },
  {
    accessorKey: "findingCount",
    header: "Findings",
    cell: ({ row }) =>
      row.original.worstSeverity ? (
        <span className="flex items-center gap-2">
          <Badge variant={severityVariant(row.original.worstSeverity)}>{row.original.worstSeverity}</Badge>
          {row.original.findingCount}
        </span>
      ) : (
        row.original.findingCount
      ),
  },
  {
    accessorKey: "lastRun",
    header: "Last run",
    cell: ({ row }) =>
      row.original.lastRun ? new Date(row.original.lastRun).toLocaleDateString() : "—",
  },
  {
    accessorKey: "usd",
    header: "Cost",
    cell: ({ row }) => (row.original.usd == null ? "—" : `$${row.original.usd.toFixed(2)}`),
  },
];

/** The /audits overview table (read-only in this task; selection is added in Task 7). */
export function AuditsTable({ rows }: { rows: AuditRow[] }) {
  return <DataTable columns={columns} data={rows} filterColumns={["status"]} pageSize={20} />;
}
```

- [ ] **Step 3: Create the page (RSC)**

```tsx
// src/app/(app)/audits/page.tsx
import { AuditsTable, type AuditRow } from "./audits-table";
import { summarizeFleet } from "@/server/llm/audit-batch";
import { prisma } from "@/server/db";

export const dynamic = "force-dynamic";

const SEVERITY_ORDER = ["critical", "high", "medium", "low", "info"];

/** Fleet-wide audit overview: the latest audit per repo (score, status, findings, last run, cost),
 *  incl. never-audited repos, with summary KPIs. Batch selection/estimate is layered on in Task 7. */
export default async function AuditsPage() {
  const repos = await prisma.repo.findMany({
    where: { isArchived: false },
    orderBy: { nameWithOwner: "asc" },
    include: {
      audits: {
        orderBy: { createdAt: "desc" },
        take: 1,
        include: { findings: { select: { severity: true } } },
      },
    },
  });

  const rows: AuditRow[] = repos.map((repo) => {
    const audit = repo.audits[0] ?? null;
    const severities = audit?.findings.map((f) => f.severity) ?? [];
    const worstSeverity = SEVERITY_ORDER.find((s) => severities.includes(s)) ?? null;
    return {
      id: repo.id,
      nameWithOwner: repo.nameWithOwner,
      auditHref: `/repos/${repo.id}/audit`,
      status: audit?.status ?? "none",
      score: audit?.score ?? null,
      worstSeverity,
      findingCount: audit?.findings.length ?? 0,
      lastRun: audit ? audit.createdAt.toISOString() : null,
      usd: audit?.estimatedUsd ? Number(audit.estimatedUsd) : null,
    };
  });

  const summary = summarizeFleet(
    rows.map((r) => ({
      hasAudit: r.status !== "none",
      score: r.score,
      status: r.status,
      findingCount: r.findingCount,
    })),
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Audits</h1>
        <p className="text-sm text-muted-foreground">
          {summary.auditedRepos}/{summary.totalRepos} repos audited
          {summary.averageScore != null ? ` · avg score ${summary.averageScore}/100` : ""} ·{" "}
          {summary.openFindings} findings
        </p>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nothing cached yet — open the Dashboard and click <strong>Refresh data</strong>.
        </p>
      ) : (
        <AuditsTable rows={rows} />
      )}
    </div>
  );
}
```

> Adapt the installed `statistics-component-03` block to render the three summary KPIs (audited ratio, avg score, open findings) in place of the plain `<p>` above once its markup is trimmed; and use `empty-state-02` for the `rows.length === 0` branch. Both stay within `@/components/ui/*`.

- [ ] **Step 4: Write the UI-import guard test**

```ts
// src/app/(app)/audits/ui-imports.test.ts
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const DIR = join(process.cwd(), "src/app/(app)/audits");

function importSpecifiers(src: string): string[] {
  return Array.from(src.matchAll(/import[^"']*["']([^"']+)["']/g)).map((m) => m[1]);
}

describe("/audits UI imports stay within shadcn/ui", () => {
  const files = readdirSync(DIR).filter((f) => f.endsWith(".tsx"));
  it("has table/page files", () => expect(files.length).toBeGreaterThan(0));
  for (const file of files) {
    it(`${file} imports UI only from ui/*, data-table, lucide (no other @/components, no recharts/css)`, () => {
      const specs = importSpecifiers(readFileSync(join(DIR, file), "utf8"));
      for (const spec of specs) {
        expect(spec).not.toBe("recharts");
        expect(spec.endsWith(".css")).toBe(false);
        if (spec.startsWith("@/components/")) {
          const ok = spec.startsWith("@/components/ui/") || spec === "@/components/data-table";
          expect(ok, `${file}: disallowed UI import ${spec}`).toBe(true);
        }
      }
    });
  }
});
```

- [ ] **Step 5: Verify + commit**

Run: `pnpm test src/app/'(app)'/audits/ui-imports.test.ts && pnpm check && pnpm build`
Expected: PASS; `/audits` builds.

```bash
git add "src/app/(app)/audits" src/components/app-sidebar.tsx
git commit -m "feat(audits): /audits overview page + sidebar + UI-import guard"
```

---

### Task 7: Row selection + "Audit selected" trigger

**Files:**
- Modify: `src/components/data-table.tsx` (optional row selection)
- Modify: `src/app/(app)/audits/audits-table.tsx` (select column + action bar)

**Interfaces:**
- Consumes: `startBatchEstimate` (audits/actions.ts); `Checkbox` (`@/components/ui/checkbox`).
- Produces: selected-repo state + a `batchId` handed to `BatchPanel` (Task 8).

> **Refinement vs spec §6:** row selection is added to the shared, already-shadcnstudio-derived `DataTable` (grafting `datatable-component-03`'s checkbox/`getIsSelected` pattern) rather than installing a second datatable block — DRY, and existing pages are unaffected because the props are optional.

- [ ] **Step 1: Extend `DataTable` with optional selection**

In `src/components/data-table.tsx`: add `useEffect` to the `react` import; extend props and the table config:

```ts
// add to DataTableProps
  /** Stable row id (e.g. (r) => r.id); required for selection. */
  getRowId?: (row: TData) => string;
  /** Called with selected row ids whenever selection changes (enables selection when provided). */
  onSelectedIdsChange?: (ids: string[]) => void;
```

```ts
// inside DataTable, before useReactTable
const [rowSelection, setRowSelection] = useState<Record<string, boolean>>({});
```

Add to the `useReactTable({...})` config: `enableRowSelection: Boolean(onSelectedIdsChange)`, `onRowSelectionChange: setRowSelection`, `getRowId`, and add `rowSelection` to `state`. After the hook:

```ts
useEffect(() => {
  onSelectedIdsChange?.(Object.keys(rowSelection));
}, [rowSelection, onSelectedIdsChange]);
```

- [ ] **Step 2: Add the select column + action bar to `AuditsTable`**

Convert `AuditsTable` to manage selection and render the action bar. Add imports (`useCallback`, `useState` from react; `useRouter` from `next/navigation`; `Button`, `Checkbox`; `startBatchEstimate`; `BatchPanel` from `./batch-panel` — created in Task 8). Prepend a `select` column:

```tsx
{
  id: "select",
  header: ({ table }) => (
    <Checkbox
      checked={table.getIsAllPageRowsSelected() || (table.getIsSomePageRowsSelected() && "indeterminate")}
      onCheckedChange={(v) => table.toggleAllPageRowsSelected(!!v)}
      aria-label="Select all"
    />
  ),
  cell: ({ row }) => (
    <Checkbox
      checked={row.getIsSelected()}
      onCheckedChange={(v) => row.toggleSelected(!!v)}
      aria-label="Select row"
    />
  ),
  enableSorting: false,
},
```

Wrap the table with selection state + an action bar (default-select all active handled by passing `data`; selection starts empty — a "Select all" header check selects the page):

```tsx
const getRowId = useCallback((r: AuditRow) => r.id, []);
const [selected, setSelected] = useState<string[]>([]);
const [force, setForce] = useState(false);
const [batchId, setBatchId] = useState<string | null>(null);
const [pending, startTransition] = useTransition();

function onAudit() {
  startTransition(async () => {
    const res = await startBatchEstimate(selected, force);
    if (res.ok && res.batchId) setBatchId(res.batchId);
  });
}
```

Action bar (shadcn `Button` + `Checkbox`): "Audit selected (N)" disabled when `selected.length === 0 || pending`; a "Re-audit unchanged" `Checkbox` bound to `force`. Pass `getRowId` + `onSelectedIdsChange={setSelected}` to `DataTable`. Render `<BatchPanel batchId={batchId} onDone={() => setBatchId(null)} />` when `batchId`.

- [ ] **Step 3: Verify + commit**

Run: `pnpm check`
Expected: no errors (BatchPanel import will resolve after Task 8 — implement Task 8 before running the app; typecheck this task after adding the `batch-panel.tsx` stub or reorder: create the stub first).

```bash
git add src/components/data-table.tsx "src/app/(app)/audits/audits-table.tsx"
git commit -m "feat(audits): row selection + Audit selected action"
```

---

### Task 8: Batch panel — poll estimate, confirm/cancel

**Files:**
- Create: `src/app/(app)/audits/batch-panel.tsx` (client)
- Add via CLI: `@ss-blocks/dashboard-dialog-02` (confirmation shell)

**Interfaces:**
- Consumes: `getBatchState`, `confirmBatch`, `cancelBatch`, `BatchView` (audits/actions.ts); `Dialog`/`Table`/`Button`/`Badge`/`Alert`/`Skeleton` (`@/components/ui/*`); `statusVariant` (audit-ui.ts).

- [ ] **Step 1: Install the dialog block**

Run (with `EMAIL`/`LICENSE_KEY` exported as in Task 5):
```bash
pnpm dlx shadcn@latest add @ss-blocks/dashboard-dialog-02
```
Then trim its demo content to a confirmation shell; fix imports/icons per the shadcn skill.

- [ ] **Step 2: Implement `BatchPanel`**

Poll `getBatchState(batchId)` every 2s while `status ∈ {estimating, running}`; render:
- `estimating` → `Skeleton` rows + an `Alert` "Estimating…".
- `estimated` → a `Dialog` (from `dashboard-dialog-02`) with a `Table` breakdown (repo · decision `Badge` · est $, `skip_unchanged`/`skip_no_config`/`error` shown with the item's `error` in a muted/`destructive` line), the total (`totalEstimatedUsd`) and `auditCount`, and buttons **Confirm & run {auditCount} (${total})** → `confirmBatch` and **Cancel** → `cancelBatch` then `onDone()`.
- `running` → progress from `progress` (e.g. `{completed+failed}/{total}`), per-repo `auditStatus` `Badge`.
- `completed` → summary line + a "Close" button calling `onDone()`.

```tsx
// src/app/(app)/audits/batch-panel.tsx
"use client";

import { useEffect, useState, useTransition } from "react";
import { cancelBatch, confirmBatch, getBatchState, type BatchView } from "./actions";
// ...import Dialog/Table/Button/Badge/Alert/Skeleton from @/components/ui/*, statusVariant from @/lib/audit-ui

/** Client panel that polls a batch estimate and drives confirm/cancel + live run progress. */
export function BatchPanel({ batchId, onDone }: { batchId: string; onDone: () => void }) {
  const [view, setView] = useState<BatchView | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      const v = await getBatchState(batchId);
      if (alive) setView(v);
    };
    void tick();
    const timer = setInterval(() => {
      if (view?.status === "estimating" || view?.status === "running") void tick();
    }, 2000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [batchId, view?.status]);

  // render per `view.status` as described above; Confirm → startTransition(confirmBatch),
  // Cancel → startTransition(async () => { await cancelBatch(batchId); onDone(); })
  // (full JSX composed from @/components/ui/* only)
  return null; // replace with the composed Dialog/Table/Alert/Skeleton UI
}
```

> The JSX body composes only `@/components/ui/*` primitives (guarded by Task 6's test). Keep the `getBatchState` poll gated to non-terminal statuses so a completed batch stops polling.

- [ ] **Step 3: Verify + commit**

Run: `pnpm check && pnpm build`
Expected: no errors; `/audits` builds with the full flow.

```bash
git add "src/app/(app)/audits/batch-panel.tsx" src/components
git commit -m "feat(audits): batch estimate/confirm panel"
```

---

### Task 9: End-to-end verification + docs

**Files:** none (verification) — plus create the Project #16 tracking issue and open the PR.

- [ ] **Step 1: Full gate**

Run: `pnpm check && pnpm test && pnpm build && pnpm docstring:coverage`
Expected: all green; docstring coverage ≥ 80%.

- [ ] **Step 2: Manual e2e (per spec §11)**

With a DB + worker running and an Anthropic key configured: open `/audits`; confirm all repos list with latest-audit status (never-audited = "—") and correct KPIs; select repos → "Audit selected" → estimate breakdown shows per-repo est $, `skip_unchanged` for unchanged repos, `error` for no-config/rate-limited; confirm → runs enqueue, statuses go live, batch reaches `completed`; re-run with no new commits → all `skip_unchanged` ($0).

- [ ] **Step 3: Tracking issue + PR**

Create the Project #16 tracking issue for Fleet-Audit; push `feature/fleet-audit`; open the PR to `main` with `Closes #<issue>`; run the CodeRabbit loop (hook-enforced) to completion before requesting merge.

---

## Self-Review

**1. Spec coverage:** §3 data model → Task 1; §4 worker/state machine → Tasks 3–4 (estimate worker, confirm/cancel, lazy completion in `getBatchState`); §5 cost model → Task 3 (`estimateUsd` reuse) + `ORCHID_AUDIT_MAX_USD` untouched in `runAudit`; §6 routes/UI + blocks → Tasks 5–8; §7 gating → Task 4 `auditGate`; §8 error handling → per-item try/catch (Task 3), idempotent confirm + dedup (Task 4), graceful run failures (unchanged `runAudit`), single-active-batch guard (Task 4); §9 testing → pure tests (Task 2), enqueue test (Task 3), badge test (Task 5), UI-import guard (Task 6); §10 file layout → all tasks; §11 verification → Task 9; §12–13 open items → Task 9 Step 3.

**2. Placeholders:** backend tasks (1–4) carry full code. UI block internals (statistics-03, empty-state-02, dashboard-dialog-02) are produced by the shadcn CLI then adapted — the plan specifies exact install commands, adaptation targets, our data shapes/props, and the composed logic (columns, selection, poll), which is the correct handling for third-party registry source (pre-writing it would be invention). `BatchPanel`'s JSX is described field-by-field with a stub to fill.

**3. Type consistency:** `ItemDecision` (Task 2) is reused in Tasks 3–4; `AuditRow` (Task 6) consumed by Task 7; `BatchView`/`BatchItemView` (Task 4) consumed by Task 8; `severityVariant`/`statusVariant` (Task 5) used in Tasks 6+8; `startBatchEstimate(repoIds, force)` signature matches its Task 7 call; `getRowId`/`onSelectedIdsChange` (Task 7 DataTable) match `AuditsTable` usage.

## Notes carried to execution

- **Refinements vs spec** (flag to reviewer): `AuditBatch.force` column added (Task 1); row selection grafted into the shared `DataTable` instead of a second datatable block (Task 7); `SYSTEM_PROMPT`/`buildContent` exported + `getDefaultBranchHeadSha` added for reuse (Task 3, non-behavioral).
- **Task order note:** create the `batch-panel.tsx` stub (Task 8 Step 2 skeleton) before typechecking Task 7, or implement Task 8 immediately after Task 7.
