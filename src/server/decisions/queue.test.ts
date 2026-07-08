import { describe, expect, it } from "vitest";
import {
  type DecisionItem,
  buildPullItem,
  classifyPull,
  countUnresolvedCodeRabbitThreads,
  prioritizeDecisions,
} from "./queue";

const basePull = {
  checksState: null as string | null,
  reviewDecision: null as string | null,
  isDraft: false,
  mergeable: "MERGEABLE" as string | null,
};

describe("classifyPull", () => {
  it("flags failing checks (FAILURE and ERROR)", () => {
    expect(classifyPull({ ...basePull, checksState: "FAILURE" })).toBe("failing_checks");
    expect(classifyPull({ ...basePull, checksState: "ERROR" })).toBe("failing_checks");
  });

  it("failing checks win even when the PR is approved", () => {
    expect(
      classifyPull({ ...basePull, checksState: "FAILURE", reviewDecision: "APPROVED" }),
    ).toBe("failing_checks");
  });

  it("ready-to-merge requires approved + green + non-draft + not conflicting", () => {
    const ready = { ...basePull, checksState: "SUCCESS", reviewDecision: "APPROVED" };
    expect(classifyPull(ready)).toBe("ready_to_merge");
    expect(classifyPull({ ...ready, isDraft: true })).toBeNull();
    expect(classifyPull({ ...ready, mergeable: "CONFLICTING" })).toBeNull();
    expect(classifyPull({ ...ready, reviewDecision: "CHANGES_REQUESTED" })).toBeNull();
    expect(classifyPull({ ...ready, checksState: "PENDING" })).toBeNull();
  });

  it("returns null for a plain in-flight PR", () => {
    expect(classifyPull(basePull)).toBeNull();
  });
});

describe("buildPullItem", () => {
  const pr = {
    nodeId: "PR_1",
    number: 7,
    title: "Fix login",
    url: "https://github.com/x/y/pull/7",
    checksState: "FAILURE",
    ghUpdatedAt: new Date("2026-07-08T10:00:00Z"),
    syncedAt: new Date("2026-07-08T11:00:00Z"),
  };

  it("keys failing-checks items by state so a status flip resets dismissals", () => {
    expect(buildPullItem(pr, "x/y", "failing_checks").dedupeKey).toBe(
      "decision:pr-checks:PR_1:FAILURE",
    );
    expect(buildPullItem(pr, "x/y", "ready_to_merge").dedupeKey).toBe("decision:pr-ready:PR_1");
  });

  it("prefers the GitHub update time as occurredAt, falling back to syncedAt", () => {
    expect(buildPullItem(pr, "x/y", "failing_checks").occurredAt).toEqual(pr.ghUpdatedAt);
    expect(
      buildPullItem({ ...pr, ghUpdatedAt: null }, "x/y", "failing_checks").occurredAt,
    ).toEqual(pr.syncedAt);
  });
});

describe("prioritizeDecisions", () => {
  const item = (dedupeKey: string, priority: number, occurredAt: string): DecisionItem => ({
    dedupeKey,
    kind: "failing_checks",
    priority,
    repo: "x/y",
    title: dedupeKey,
    detail: null,
    externalUrl: null,
    occurredAt: new Date(occurredAt),
  });

  it("orders by priority, then oldest first, and drops dismissed keys", () => {
    const items = [
      item("d:ready", 4, "2026-07-01T00:00:00Z"),
      item("d:checks-new", 1, "2026-07-08T00:00:00Z"),
      item("d:checks-old", 1, "2026-07-02T00:00:00Z"),
      item("d:finding", 5, "2026-07-03T00:00:00Z"),
    ];
    const result = prioritizeDecisions(items, new Set(["d:finding"]));
    expect(result.map((i) => i.dedupeKey)).toEqual(["d:checks-old", "d:checks-new", "d:ready"]);
  });

  it("resurfaces an item whose key changed after the dismissal", () => {
    const dismissed = new Set(["decision:pr-checks:PR_1:FAILURE"]);
    const flipped = [item("decision:pr-checks:PR_1:ERROR", 1, "2026-07-08T00:00:00Z")];
    expect(prioritizeDecisions(flipped, dismissed)).toHaveLength(1);
  });
});

describe("countUnresolvedCodeRabbitThreads", () => {
  const thread = (isResolved: boolean, login: string | null) => ({
    isResolved,
    comments: { nodes: [login ? { author: { login } } : { author: null }] },
  });

  it("counts only unresolved threads opened by CodeRabbit", () => {
    const result = {
      repository: {
        pullRequest: {
          reviewThreads: {
            nodes: [
              thread(false, "coderabbitai"),
              thread(false, "coderabbitai[bot]"),
              thread(true, "coderabbitai"), // resolved
              thread(false, "bvk"), // human thread
              null,
            ],
          },
        },
      },
    };
    expect(countUnresolvedCodeRabbitThreads(result)).toBe(2);
  });

  it("is 0 for missing repository/PR nodes", () => {
    expect(countUnresolvedCodeRabbitThreads({ repository: null })).toBe(0);
    expect(countUnresolvedCodeRabbitThreads({ repository: { pullRequest: null } })).toBe(0);
  });
});
