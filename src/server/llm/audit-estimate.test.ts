import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// --- IO boundary mocks ------------------------------------------------------
// runBatchEstimate's only IO is Prisma, the decrypted key, the GitHub context (head sha + files) and
// the Anthropic token count. We mock those and let the REAL staleness/aggregation/pricing logic run
// (decideStaleness, aggregateEstimate, estimateUsd, auditMaxUsd are imported unmocked by the module).
vi.mock("@/server/db", () => ({
  prisma: {
    auditBatch: { findUnique: vi.fn(), update: vi.fn() },
    auditBatchItem: { update: vi.fn(), findMany: vi.fn() },
    repoAudit: { findFirst: vi.fn() },
    repoHookState: { findMany: vi.fn() },
  },
}));
vi.mock("@/server/llm/keys", () => ({ getDecryptedProviderKey: vi.fn() }));
vi.mock("@/server/llm/context", () => ({
  collectAuditContext: vi.fn(),
  getDefaultBranchHeadSha: vi.fn(),
}));
vi.mock("@/server/llm/anthropic", () => ({ countInputTokens: vi.fn() }));

import { countInputTokens } from "@/server/llm/anthropic";
import { collectAuditContext, getDefaultBranchHeadSha } from "@/server/llm/context";
import { prisma } from "@/server/db";
import { getDecryptedProviderKey } from "@/server/llm/keys";

import { runBatchEstimate } from "./audit-estimate";

const db = vi.mocked(prisma, true);
const mockGetKey = vi.mocked(getDecryptedProviderKey);
const mockCollect = vi.mocked(collectAuditContext);
const mockHeadSha = vi.mocked(getDefaultBranchHeadSha);
const mockCountTokens = vi.mocked(countInputTokens);

/** A minimal repo stub — only fields buildContent/context read matter, and those are mocked. */
const repo = (id: string) => ({ id, nameWithOwner: `o/${id}`, defaultBranch: "main" });

/** Build the batch `findUnique` payload the worker loads (batch + items-with-repo). */
function batchWith(items: { id: string; repoId: string }[], force = false) {
  return {
    id: "b",
    status: "estimating",
    force,
    items: items.map((i) => ({ ...i, repo: repo(i.repoId) })),
  } as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetKey.mockResolvedValue("sk-ant-test");
  db.auditBatchItem.update.mockResolvedValue({} as never);
  db.auditBatch.update.mockResolvedValue({} as never);
  // Default: no prior completed audit (so every repo looks "never audited" unless overridden).
  db.repoAudit.findFirst.mockResolvedValue(null);
  db.repoHookState.findMany.mockResolvedValue([] as never);
  // Default finalize aggregation reads an empty item set unless a test sets it.
  db.auditBatchItem.findMany.mockResolvedValue([] as never);
});

afterEach(() => vi.unstubAllEnvs());

describe("runBatchEstimate — guards", () => {
  it("no-ops when the batch is missing", async () => {
    db.auditBatch.findUnique.mockResolvedValue(null);
    await runBatchEstimate("b");
    expect(db.auditBatchItem.update).not.toHaveBeenCalled();
    expect(db.auditBatch.update).not.toHaveBeenCalled();
  });

  it("no-ops when the batch is not in the estimating state", async () => {
    db.auditBatch.findUnique.mockResolvedValue({ id: "b", status: "estimated", force: false, items: [] } as never);
    await runBatchEstimate("b");
    expect(db.auditBatchItem.update).not.toHaveBeenCalled();
  });

  it("fails the batch when no Anthropic key is configured", async () => {
    db.auditBatch.findUnique.mockResolvedValue(batchWith([{ id: "it1", repoId: "r1" }]));
    mockGetKey.mockResolvedValue(null);
    await runBatchEstimate("b");
    // Fatal (pre-loop) error → whole batch marked failed, no per-item writes.
    expect(db.auditBatchItem.update).not.toHaveBeenCalled();
    expect(db.auditBatch.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "b" }, data: expect.objectContaining({ status: "failed" }) }),
    );
  });
});

describe("runBatchEstimate — per-item decisions", () => {
  it("skip_unchanged when the head sha equals the last completed audit's commit and not forced", async () => {
    db.auditBatch.findUnique.mockResolvedValue(batchWith([{ id: "it1", repoId: "r1" }], false));
    db.repoAudit.findFirst.mockResolvedValue({ commitSha: "sha_same" } as never);
    mockHeadSha.mockResolvedValue("sha_same");

    await runBatchEstimate("b");

    // Skipped without ever collecting config or counting tokens.
    expect(mockCollect).not.toHaveBeenCalled();
    expect(mockCountTokens).not.toHaveBeenCalled();
    expect(db.auditBatchItem.update).toHaveBeenCalledWith({
      where: { id: "it1" },
      data: expect.objectContaining({ decision: "skip_unchanged", estimatedUsd: 0, estimatedInputTokens: 0 }),
    });
  });

  it("skip_no_config when the repo has no auditable config files", async () => {
    db.auditBatch.findUnique.mockResolvedValue(batchWith([{ id: "it1", repoId: "r1" }], false));
    mockHeadSha.mockResolvedValue("sha_new");
    mockCollect.mockResolvedValue({ files: [], omitted: [], commitSha: "sha_new", truncated: false } as never);

    await runBatchEstimate("b");

    // No token count for an empty config set.
    expect(mockCountTokens).not.toHaveBeenCalled();
    expect(db.auditBatchItem.update).toHaveBeenCalledWith({
      where: { id: "it1" },
      data: expect.objectContaining({ decision: "skip_no_config", commitSha: "sha_new" }),
    });
  });

  it("will_audit with a real estimatedUsd when the cost is under the cap", async () => {
    db.auditBatch.findUnique.mockResolvedValue(batchWith([{ id: "it1", repoId: "r1" }], false));
    mockHeadSha.mockResolvedValue("sha_new");
    mockCollect.mockResolvedValue({
      files: [{ path: ".claude/settings.json", content: "{}" }],
      omitted: [],
      commitSha: "sha_new",
      truncated: false,
    } as never);
    // sonnet default: $3/M in, $15/M out. 10k in + 8k out budget = 0.03 + 0.12 = $0.15 < $0.50 cap.
    mockCountTokens.mockResolvedValue(10_000);

    await runBatchEstimate("b");

    const call = db.auditBatchItem.update.mock.calls.find((c) => c[0].where.id === "it1");
    expect(call?.[0].data).toMatchObject({ decision: "will_audit", estimatedInputTokens: 10_000 });
    // Real estimateUsd ran (not a mock echo): 10k*3/1e6 + 8k*15/1e6 = 0.15.
    expect(call?.[0].data.estimatedUsd).toBeCloseTo(0.15, 5);
  });

  it("error (over-cap) when the estimate exceeds the per-run cap", async () => {
    vi.stubEnv("ORCHID_AUDIT_MAX_USD", "0.10"); // lower the cap below the $0.15 estimate
    db.auditBatch.findUnique.mockResolvedValue(batchWith([{ id: "it1", repoId: "r1" }], false));
    mockHeadSha.mockResolvedValue("sha_new");
    mockCollect.mockResolvedValue({
      files: [{ path: ".claude/settings.json", content: "{}" }],
      omitted: [],
      commitSha: "sha_new",
      truncated: false,
    } as never);
    mockCountTokens.mockResolvedValue(10_000); // → $0.15 estimate > $0.10 cap

    await runBatchEstimate("b");

    const call = db.auditBatchItem.update.mock.calls.find((c) => c[0].where.id === "it1");
    expect(call?.[0].data.decision).toBe("error");
    // The over-cap branch records the offending estimate + a cap message, not a silent skip.
    expect(call?.[0].data.estimatedUsd).toBeCloseTo(0.15, 5);
    expect(call?.[0].data.estimatedInputTokens).toBe(10_000);
    expect(call?.[0].data.error).toMatch(/exceeds the per-run cap/i);
  });

  it("records a per-item error when a boundary throws, without failing the batch", async () => {
    db.auditBatch.findUnique.mockResolvedValue(batchWith([{ id: "it1", repoId: "r1" }], false));
    mockHeadSha.mockRejectedValue(new Error("GitHub 502"));

    await runBatchEstimate("b");

    // Item marked error via the per-item catch...
    expect(db.auditBatchItem.update).toHaveBeenCalledWith({
      where: { id: "it1" },
      data: expect.objectContaining({ decision: "error", error: expect.stringMatching(/GitHub 502/) }),
    });
    // ...and the batch still finalized to `estimated` (not failed).
    expect(db.auditBatch.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "b" }, data: expect.objectContaining({ status: "estimated" }) }),
    );
  });
});

describe("runBatchEstimate — finalization", () => {
  it("aggregates the persisted items and flips the batch to estimated with totals", async () => {
    db.auditBatch.findUnique.mockResolvedValue(
      batchWith([
        { id: "it1", repoId: "r1" },
        { id: "it2", repoId: "r2" },
        { id: "it3", repoId: "r3" },
      ], false),
    );
    // r1 under cap → will_audit; r2 unchanged → skip; r3 no config → skip.
    mockHeadSha.mockResolvedValueOnce("sha_r1").mockResolvedValueOnce("sha_r2").mockResolvedValueOnce("sha_r3");
    // r2 has a matching completed audit (skip_unchanged); r1 + r3 have none.
    db.repoAudit.findFirst
      .mockResolvedValueOnce(null) // r1
      .mockResolvedValueOnce({ commitSha: "sha_r2" } as never) // r2 unchanged
      .mockResolvedValueOnce(null); // r3
    mockCollect
      .mockResolvedValueOnce({ files: [{ path: "AGENTS.md", content: "x" }], omitted: [], commitSha: "sha_r1", truncated: false } as never) // r1
      .mockResolvedValueOnce({ files: [], omitted: [], commitSha: "sha_r3", truncated: false } as never); // r3 (r2 skipped before collect)
    mockCountTokens.mockResolvedValue(10_000); // r1 → $0.15

    // The finalize step re-reads items from the DB; return the shape aggregateEstimate consumes.
    db.auditBatchItem.findMany.mockResolvedValue([
      { decision: "will_audit", estimatedUsd: 0.15, estimatedInputTokens: 10_000 },
      { decision: "skip_unchanged", estimatedUsd: 0, estimatedInputTokens: 0 },
      { decision: "skip_no_config", estimatedUsd: null, estimatedInputTokens: null },
    ] as never);

    await runBatchEstimate("b");

    // Real aggregateEstimate over the persisted items: 1 audit, 2 skipped, $0.15, 10k tokens.
    expect(db.auditBatch.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "b" },
        data: expect.objectContaining({
          status: "estimated",
          totalEstimatedUsd: 0.15,
          totalEstimatedInputTokens: 10_000,
          auditCount: 1,
          skippedCount: 2,
        }),
      }),
    );
  });
});
