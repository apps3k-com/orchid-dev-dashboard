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
