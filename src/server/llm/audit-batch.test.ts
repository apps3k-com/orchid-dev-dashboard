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
