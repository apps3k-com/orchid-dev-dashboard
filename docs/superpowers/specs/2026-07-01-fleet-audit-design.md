# Fleet-Audit — Design Spec

- **Status:** Approved design (brainstorming complete) — ready for implementation planning
- **Date:** 2026-07-01
- **Branch:** `feature/fleet-audit`
- **Repo:** `apps3k-com/orchid-dev-dashboard`
- **Tracking issue:** _to be created before implementation_ (Project #16)

## 1. Context & Goal

Orchid can audit **one repo at a time** today via `/repos/[id]/audit`: `requestAudit`
creates a `RepoAudit` (pending) and enqueues `audit:run`; `runAudit()` collects the repo
config, runs a cost-guarded Anthropic call, and persists findings.

**Fleet-Audit turns the single-repo auditor into a fleet feature:** a new `/audits`
overview across **all managed repos** (latest audit per repo — health score, status,
findings count, last run, cost) plus a **batch flow** to estimate and run audits across a
selected set of repos in one action. It reuses the verified single-repo engine unchanged.

## 2. Locked Decisions

From the brainstorming Q&A:

| # | Decision | Choice |
|---|---|---|
| 1 | Batch scope | **Checkbox selection**, default = all active (non-archived) repos; action "Audit selected" |
| 2 | Batch cost guard | **Exact pre-flight estimate per repo** shown before commit (no separate fleet ceiling) |
| 3 | Re-audit policy | Default **skip if default-branch commit unchanged** since last completed audit; user can force via checkbox |
| 4 | Architecture | **Approach A** — async two-phase with a persisted batch (`AuditBatch` + `AuditBatchItem`) |

**UI block selection** (verified from source via the shadcn CLI against the Pro
`@ss-blocks` registry configured in `components.json`):

| Element | Block | Verified |
|---|---|---|
| Overview table + "Audit selected" | `@ss-blocks/datatable-component-03` (Fleet mgmt datatable) | `@tanstack/react-table`, `Checkbox`+`getIsSelected` (row-select), `Badge` (status), `DropdownMenu` (actions), `getPaginationRowModel` |
| Fleet summary (KPIs) | `@ss-blocks/statistics-component-03` | `Card`+`Badge`, no `recharts` |
| Empty state | `@ss-blocks/empty-state-02` | core `Empty` + `Button` CTA, no `recharts` |
| Estimate/confirm dialog | `@ss-blocks/dashboard-dialog-02` | real `Dialog`+`Button`; per-repo cost `Table` composed inside |

## 3. Data Model

Two new tables; `RepoAudit`/`AuditFinding` unchanged. Add back-relations on `Repo`
(`auditBatchItems AuditBatchItem[]`) and `RepoAudit` (`batchItem AuditBatchItem?`).

```prisma
model AuditBatch {
  id                        String    @id @default(cuid())
  status                    String    @default("estimating") // estimating | estimated | running | completed | cancelled | failed
  force                     Boolean   @default(false) // re-audit even if the commit is unchanged
  triggeredByLogin          String?
  totalEstimatedUsd         Decimal?  @db.Decimal(10, 4)
  totalEstimatedInputTokens Int?
  repoCount                 Int       // selected repos
  auditCount                Int?      // will actually run (decided at estimate)
  skippedCount              Int?
  error                     String?
  items                     AuditBatchItem[]
  createdAt                 DateTime  @default(now())
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
  commitSha            String?    // default-branch head seen at estimate time
  lastAuditCommitSha   String?    // for transparency: why skipped as "unchanged"
  error                String?    // estimate error (no config / rate-limited / fetch)
  audit                RepoAudit? @relation(fields: [auditId], references: [id], onDelete: SetNull)
  auditId              String?    @unique // set at confirm — links the real run 1:1
  createdAt            DateTime   @default(now())
  @@unique([batchId, repoId])
  @@index([batchId])
}
```

`@@unique([batchId, repoId])` prevents duplicate rows in a batch; `auditId @unique` makes
item↔run 1:1 and answers "which batch triggered this run".

## 4. Worker Tasks & Data Flow

One new worker task, `audit:estimate`, registered in the `taskList` in
`src/server/jobs/worker.ts` (next to `sync:all` and `audit:run`). `audit:run` and
`runAudit()` are unchanged.

**State machine (batch):** `estimating → estimated → running → completed`; plus
`estimating → failed` (worker crash) and `estimated → cancelled` (user cancels).
**Item decision** (set at estimate): `will_audit | skip_unchanged | skip_no_config | error`.

1. **`startBatchEstimate(repoIds, { force })`** — server action (gated, §7). Creates
   `AuditBatch(estimating)` + one `AuditBatchItem(pending)` per repo, then enqueues
   `audit:estimate { batchId }` via a new `enqueueBatchEstimate()` in
   `src/server/jobs/enqueue.ts` (stable `jobKey = "batch:estimate:<batchId>"`). Returns
   `batchId`.
2. **`audit:estimate` worker** → for each item:
   - fetch the repo's default-branch head SHA (`commitSha`);
   - if `!force` and the latest **completed** `RepoAudit` for the repo has the same
     `commitSha` → `skip_unchanged` (est $0), record `lastAuditCommitSha`;
   - else `collectAuditContext(repo)` (`src/server/llm/context.ts`) + `countInputTokens()`
     (`src/server/llm/anthropic.ts`) → `estimatedInputTokens`; `estimatedUsd =
     estimateUsd(model, estimatedInputTokens, AUDIT_MAX_OUTPUT_TOKENS)` where `model` is the
     provider default (`PROVIDERS.anthropic.defaultModel` = `claude-sonnet-4-6`, the same
     resolution `requestAudit` uses when creating a `RepoAudit`); `estimateUsd` is already
     exported from `src/server/llm/audit.ts:30`; `will_audit`;
   - on error (no config / fetch / rate-limited) → `error` + message.
   Aggregate totals (`totalEstimatedUsd`, `totalEstimatedInputTokens`, `auditCount`,
   `skippedCount`) → `AuditBatch.estimated` + `estimatedAt`.
3. **UI polls** the batch. On `estimated`, renders the breakdown (per repo: decision, est $,
   skip reason / error) + total.
4. **`confirmBatch(batchId)`** — server action (gated, idempotent: already-confirmed → no-op).
   For each `will_audit` item: create `RepoAudit(pending)` (as `requestAudit` does today) +
   enqueue `audit:run` + set `item.auditId`. Skip items whose repo already has a
   `pending|running` audit (dedup). Batch → `running` + `confirmedAt`.
5. **`runAudit()` unchanged** — each linked run enforces the per-repo cost cap and records
   failures on its own row. **Batch completion is computed lazily on read** from the linked
   audits' statuses (no reconcile worker); `completedAt` is set opportunistically when all
   linked runs are terminal.
6. **`cancelBatch(batchId)`** — server action (gated). Valid only from `estimated`
   (pre-confirm) → `cancelled`; once confirmed, runs are already dispatched and are left to
   finish.

## 5. Cost Model

- **Per-repo hard cap** `ORCHID_AUDIT_MAX_USD` remains enforced inside `runAudit()` (the
  backstop). Output is capped by `AUDIT_MAX_OUTPUT_TOKENS`.
- **Batch guard = the exact estimate + confirm** (decision Q2). Each item's `estimatedUsd`
  is computed with the **same `estimateUsd(model, inputTokens, AUDIT_MAX_OUTPUT_TOKENS)`**
  the per-run guard uses, so the displayed number matches what the run will be checked
  against. `count_tokens` is free (no output billing) but is one API call + one
  `collectAuditContext` (GitHub fetch) per non-skipped repo — hence the async worker.
- **No separate fleet ceiling** (deliberately not chosen).

## 6. Routes & UI

New route `src/app/(app)/audits/` + a sidebar entry in `src/components/app-sidebar.tsx`.

- **`page.tsx`** (RSC, read): fleet summary (`statistics-component-03`) + overview table
  (`datatable-component-03`) + empty state (`empty-state-02`). Data: all repos with their
  **latest** `RepoAudit` (any status) — score, status, findings count by severity, last run,
  est./actual $; never-audited repos show "—".
- **Overview columns:** ☐ · Repository (link → `/repos/[id]/audit`) · Status `Badge` ·
  Score · Findings (severity `Badge`s/counts) · Last run · Est./Actual $.
- **Selection + action bar:** row-selection checkboxes + "select all" (default = all active
  pre-selected), "Audit selected (N)" button, "Re-audit unchanged (force)" `Checkbox`.
- **Batch panel** (client): polls the batch; while `estimating` → `Skeleton` + `Alert`; on
  `estimated` → `dashboard-dialog-02` confirmation shell containing a per-repo cost `Table`
  (decision, est $, skip reason/error) + total + "Confirm & run N ($X)" / "Cancel".
- **Live refresh** during `running`: reuse the existing async-refresh pattern (#36).
- **Severity styling:** extract the single-repo audit page's severity→`Badge` mapping into a
  shared helper so both pages look identical.

**Hard UI rule (enforced by a test, §9):** files under `src/app/(app)/audits/**` and new
audit components import UI **only** from `@/components/ui/*`, `@/components/data-table`, and
`lucide-react`, plus the Tailwind utility classes already used across the app. No custom
stylesheets, no `<style>`, no deviating design. shadcnstudio blocks are installed via
`pnpm dlx shadcn@latest add @ss-blocks/<name>` (with `EMAIL`+`LICENSE_KEY` exported), then
their `@/` import aliases + lucide icons are fixed and the added files verified against the
shadcn critical rules; demo-only bits (e.g. the inline dialog in `empty-state-02`) are removed.

## 7. Gating & Authorization

Reuse the existing gate (`isLlmAdmin` from `src/server/llm/admin.ts`; consent + `keyReady`
pattern from `src/app/(app)/repos/[id]/audit/actions.ts`):

- **`/audits` overview (read):** visible to any logged-in org member.
- **Batch actions** (`startBatchEstimate`, `confirmBatch`, `cancelBatch`): **LLM admin**
  (`ORCHID_LLM_ADMINS`) **+ consent** **+** a provider key with status `valid | rate_limited`.
  Otherwise the actions are rejected and the buttons are disabled with a hint.

## 8. Error Handling (all graceful)

- **Estimate:** per-item errors → `decision=error` + message; the batch still reaches
  `estimated`. All items error → `estimated` with 0 `will_audit`, confirm disabled. Worker
  crash → batch `failed` + `error`; UI offers "Re-estimate".
- **Confirm:** idempotent; a single failed enqueue marks that item `error`, others proceed.
- **Run:** `runAudit()` already records per-repo failures (`status=failed`). A rate-limited
  key → individual runs fail visibly; the batch stays consistent and reaches `completed`.
- **Concurrency/rate-limit:** graphile-worker bounds parallel `audit:run`; excess Anthropic
  rate-limits surface as visible `failed` rows, never a crash. (Pacing/backoff = future.)
- **Staleness race:** the estimate `commitSha` is a preview only; `runAudit()` re-fetches at
  run time and records the authoritative `commitSha`. A commit change in between → the run
  audits the new head (accepted).
- **Double-click / parallel batch:** `jobKey` on `audit:estimate`; "Audit selected" is
  disabled while a batch is `estimating|running`; a repo already `pending|running` is skipped
  at confirm (dedup).

## 9. Testing

Vitest, in the style of the existing BYOK tests; GitHub (`collectAuditContext`), Anthropic
(`countInputTokens`), and `quickAddJob` are mocked. Core logic
(staleness/aggregation/state/progress) is extracted into **pure, testable functions**, not
buried in the worker.

- Staleness decision: unchanged → `skip_unchanged`; changed/never → `will_audit`; `force`
  overrides.
- Estimate aggregation: sum `estimatedUsd`/tokens + `auditCount`/`skippedCount`.
- Batch state: `estimating→estimated`, `→failed`, confirm idempotency, **lazy** `completed`
  derived from linked audit statuses.
- Confirm: creates N `RepoAudit` + N enqueues (mocked), sets `auditId`, skips `error`/`skip`
  items and repos already `pending|running`.
- Gating: non-admin / no key rejected; `rate_limited` allowed.
- **UI-import guard:** grep-based test asserting only allowed UI imports under
  `src/app/(app)/audits/**`.
- Docstring coverage ≥ 80% (AGENTS rule) for new files.

## 10. File & Module Layout (grounded)

**New**
- `prisma/schema.prisma` — add `AuditBatch`, `AuditBatchItem` + relations; new migration.
- `src/server/llm/audit-batch.ts` — pure logic: staleness decision, estimate aggregation,
  batch progress/completion.
- `src/server/llm/audit-estimate.ts` — `runBatchEstimate(batchId)` worker body (uses
  `collectAuditContext` + `countInputTokens` + `estimateUsd`).
- `src/app/(app)/audits/page.tsx` — overview (RSC, read).
- `src/app/(app)/audits/actions.ts` — `startBatchEstimate`, `confirmBatch`, `cancelBatch`.
- `src/app/(app)/audits/audits-table.tsx` — client table (from `datatable-component-03`).
- `src/app/(app)/audits/batch-panel.tsx` — client polling + estimate breakdown + confirm
  (from `dashboard-dialog-02`).
- `src/server/llm/audit-batch.test.ts` + UI-import-guard test.

**Modified**
- `src/server/jobs/worker.ts` — register `audit:estimate` in `taskList`.
- `src/server/jobs/enqueue.ts` — add `enqueueBatchEstimate(batchId)`.
- `src/components/app-sidebar.tsx` — add `/audits` nav entry.
- Shared severity→`Badge` helper extracted from the single-repo audit page.

**Added via shadcn CLI** (`@ss-blocks/...` + any missing `@/components/ui/*` deps:
`empty`, `dialog`, `dropdown-menu`, …).

## 11. Verification (end-to-end)

1. `pnpm check` (lint + typecheck), `pnpm test` (Vitest) green; `pnpm build` succeeds.
2. Prisma migration applies; `AuditBatch`/`AuditBatchItem` exist.
3. `/audits` lists all repos with latest-audit status incl. never-audited "—"; summary KPIs
   correct.
4. Select repos → "Audit selected" → batch `estimating` → breakdown shows per-repo est $,
   `skip_unchanged` for unchanged repos, errors for no-config/rate-limited.
5. Confirm → `RepoAudit` rows created + `audit:run` enqueued; `/audits` reflects live status;
   batch reaches `completed`; a rate-limited key yields visible `failed` rows without crash.
6. Re-running "Audit all" with no new commits → all `skip_unchanged` (idempotent, $0).
7. UI review: every element from shadcn/shadcnstudio blocks; UI-import guard test passes.

## 12. Out of Scope / Future

- Fleet-wide cost ceiling + hard stop (Q2 alternative).
- Pacing/backoff / adaptive concurrency for large fleets.
- Scheduled/cron fleet audits; trend history of fleet health over time.
- Bulk "open fix PRs" across a batch's findings.

## 13. Open Items

- Create the tracking issue in Project #16 and reference it (`Closes #N`) on the PR.
- Confirm exact shadcnstudio block variants + install at build time against the live Pro
  registry (license present).
