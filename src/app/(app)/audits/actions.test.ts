import { beforeEach, describe, expect, it, vi } from "vitest";

// --- IO boundary mocks (configured per test via the vi.fn()s below) ---------
// The Prisma client, the session, the provider-key summaries and the queue are the only real IO the
// batch actions touch. We mock exactly those and assert the real decision/dedup/idempotency logic
// that runs between them. Gating is deliberately NOT mocked: we stub ORCHID_LLM_ADMINS and return a
// matching/non-matching login so the real isLlmAdmin runs (see the auditGate block).
vi.mock("@/server/db", () => ({
  prisma: {
    auditBatch: {
      findFirst: vi.fn(),
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    auditBatchItem: { update: vi.fn(), findMany: vi.fn() },
    repoAudit: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    repo: { findMany: vi.fn() },
    repoHookState: { findMany: vi.fn() },
  },
}));
vi.mock("@/server/auth/session", () => ({ getSessionUser: vi.fn() }));
vi.mock("@/server/llm/keys", () => ({
  getProviderSummaries: vi.fn(),
  getProviderDefaultModel: vi.fn(),
  getDecryptedProviderKey: vi.fn(),
}));
vi.mock("@/server/jobs/enqueue", () => ({
  enqueueAudit: vi.fn(),
  enqueueBatchEstimate: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { getSessionUser } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { enqueueAudit, enqueueBatchEstimate } from "@/server/jobs/enqueue";
import { getProviderDefaultModel, getProviderSummaries } from "@/server/llm/keys";

import { cancelBatch, confirmBatch, getBatchState, startBatchEstimate } from "./actions";

// Typed handles to the mocked functions, so calls/return values read cleanly in each test.
const mockGetSessionUser = vi.mocked(getSessionUser);
const mockGetSummaries = vi.mocked(getProviderSummaries);
const mockGetDefaultModel = vi.mocked(getProviderDefaultModel);
const mockEnqueueAudit = vi.mocked(enqueueAudit);
const mockEnqueueBatchEstimate = vi.mocked(enqueueBatchEstimate);
const db = vi.mocked(prisma, true);

const ADMIN_LOGIN = "octocat";

/** Return a User-shaped object from the session mock (only `login` is read by the gate). */
function signInAs(login: string | null): void {
  mockGetSessionUser.mockResolvedValue(login ? ({ login } as never) : null);
}

/** Configure the Anthropic provider summary the gate inspects (usable = has a valid/rate_limited key). */
function keyStatus(status: string | "none"): void {
  if (status === "none") {
    mockGetSummaries.mockResolvedValue([]);
    return;
  }
  const usable = status === "valid" || status === "rate_limited";
  mockGetSummaries.mockResolvedValue([
    {
      provider: "anthropic",
      usable,
      keys: [{ id: "key_1", label: "default", maskedHint: "…abcd", status, isDefault: true }],
    } as never,
  ]);
}

beforeEach(() => {
  vi.clearAllMocks();
  // The real isLlmAdmin reads this env; the default admin is signed in + holds a valid key so the
  // gate passes unless a test overrides it.
  vi.stubEnv("ORCHID_LLM_ADMINS", ADMIN_LOGIN);
  signInAs(ADMIN_LOGIN);
  keyStatus("valid");
  mockGetDefaultModel.mockResolvedValue("claude-sonnet-4-6");
  // The actions chain `.catch()` on these writes (best-effort failure cleanup / lazy transitions),
  // so the mocks must resolve to a thenable even when a test doesn't assert on them.
  db.auditBatch.update.mockResolvedValue({} as never);
  db.auditBatchItem.update.mockResolvedValue({} as never);
  db.repoAudit.update.mockResolvedValue({} as never);
});

// ---------------------------------------------------------------------------
// auditGate (exercised through startBatchEstimate — the gate is a private helper)
// ---------------------------------------------------------------------------
describe("auditGate via startBatchEstimate", () => {
  it("rejects when not signed in", async () => {
    signInAs(null);
    const res = await startBatchEstimate(["r1"], false, true);
    expect(res.ok).toBe(false);
    expect(res.message).toMatch(/signed in/i);
    // Gate failed before any batch work.
    expect(db.auditBatch.findFirst).not.toHaveBeenCalled();
    expect(db.auditBatch.create).not.toHaveBeenCalled();
  });

  it("rejects a signed-in non-admin", async () => {
    signInAs("random-user"); // not in ORCHID_LLM_ADMINS
    const res = await startBatchEstimate(["r1"], false, true);
    expect(res.ok).toBe(false);
    expect(res.message).toMatch(/LLM admin/i);
    expect(db.auditBatch.create).not.toHaveBeenCalled();
  });

  it("rejects an admin with no configured key", async () => {
    keyStatus("none");
    const res = await startBatchEstimate(["r1"], false, true);
    expect(res.ok).toBe(false);
    expect(res.message).toMatch(/valid Anthropic key/i);
    expect(db.auditBatch.create).not.toHaveBeenCalled();
  });

  it("rejects an admin whose key status is invalid", async () => {
    keyStatus("invalid");
    const res = await startBatchEstimate(["r1"], false, true);
    expect(res.ok).toBe(false);
    expect(res.message).toMatch(/valid Anthropic key/i);
    expect(db.auditBatch.create).not.toHaveBeenCalled();
  });

  it("passes the gate for an admin whose key is rate_limited (valid but capped)", async () => {
    keyStatus("rate_limited");
    // No active batch, one matching repo, enqueue succeeds → the action proceeds past the gate.
    db.auditBatch.findFirst.mockResolvedValue(null);
    db.repo.findMany.mockResolvedValue([{ id: "r1" }] as never);
    db.auditBatch.create.mockResolvedValue({ id: "batch_1" } as never);
    mockEnqueueBatchEstimate.mockResolvedValue(true);

    const res = await startBatchEstimate(["r1"], false, true);

    expect(res.ok).toBe(true);
    expect(res.batchId).toBe("batch_1");
    // Proof the gate did not short-circuit: the batch was actually created.
    expect(db.auditBatch.create).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// startBatchEstimate
// ---------------------------------------------------------------------------
describe("startBatchEstimate", () => {
  it("rejects when consent is not given, without creating a batch", async () => {
    const res = await startBatchEstimate(["r1"], false, false);
    expect(res.ok).toBe(false);
    expect(res.message).toMatch(/confirm sending/i);
    expect(db.auditBatch.findFirst).not.toHaveBeenCalled();
    expect(db.auditBatch.create).not.toHaveBeenCalled();
    expect(mockEnqueueBatchEstimate).not.toHaveBeenCalled();
  });

  it("rejects when a batch is already estimating/running", async () => {
    db.auditBatch.findFirst.mockResolvedValue({ id: "active" } as never);
    const res = await startBatchEstimate(["r1"], false, true);
    expect(res.ok).toBe(false);
    expect(res.message).toMatch(/already running/i);
    // The active-batch guard filters on the two live statuses.
    expect(db.auditBatch.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: { in: ["estimating", "running"] } },
      }),
    );
    expect(db.auditBatch.create).not.toHaveBeenCalled();
  });

  it("creates an estimating batch with items, enqueues, and returns the batchId (happy path)", async () => {
    db.auditBatch.findFirst.mockResolvedValue(null);
    // Duplicate + falsy ids should be collapsed to the two distinct repos before the DB lookup.
    db.repo.findMany.mockResolvedValue([{ id: "r1" }, { id: "r2" }] as never);
    db.auditBatch.create.mockResolvedValue({ id: "batch_1" } as never);
    mockEnqueueBatchEstimate.mockResolvedValue(true);

    const res = await startBatchEstimate(["r1", "r1", "r2", ""], true, true);

    expect(res).toEqual({ ok: true, message: "Estimating…", batchId: "batch_1" });
    // De-duped id set reached the repo lookup.
    expect(db.repo.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: ["r1", "r2"] } } }),
    );
    // Batch created as `estimating`, force propagated, one item per matched repo.
    const createArg = db.auditBatch.create.mock.calls[0][0];
    expect(createArg.data).toMatchObject({
      status: "estimating",
      triggeredByLogin: ADMIN_LOGIN,
      force: true,
      repoCount: 2,
      // One nested-create item per matched repo, in order.
      items: { create: [{ repoId: "r1" }, { repoId: "r2" }] },
    });
    expect(mockEnqueueBatchEstimate).toHaveBeenCalledWith("batch_1");
  });

  it("marks the batch failed when the queue is not configured", async () => {
    db.auditBatch.findFirst.mockResolvedValue(null);
    db.repo.findMany.mockResolvedValue([{ id: "r1" }] as never);
    db.auditBatch.create.mockResolvedValue({ id: "batch_1" } as never);
    mockEnqueueBatchEstimate.mockResolvedValue(false); // no queue → throws internally

    const res = await startBatchEstimate(["r1"], false, true);

    expect(res.ok).toBe(false);
    expect(db.auditBatch.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "batch_1" },
        data: expect.objectContaining({ status: "failed" }),
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// confirmBatch
// ---------------------------------------------------------------------------
describe("confirmBatch", () => {
  it("rejects a batch that is not yet estimated (e.g. still pending)", async () => {
    db.auditBatch.findUnique.mockResolvedValue({ id: "b", status: "pending", items: [] } as never);
    const res = await confirmBatch("b");
    expect(res.ok).toBe(false);
    expect(res.message).toMatch(/not ready/i);
    expect(db.repoAudit.create).not.toHaveBeenCalled();
  });

  it("is idempotent when already running — returns ok and creates nothing", async () => {
    db.auditBatch.findUnique.mockResolvedValue({ id: "b", status: "running", items: [] } as never);
    const res = await confirmBatch("b");
    expect(res.ok).toBe(true);
    expect(db.repoAudit.create).not.toHaveBeenCalled();
    expect(db.auditBatch.update).not.toHaveBeenCalled();
  });

  it("is idempotent when already completed — returns ok and creates nothing", async () => {
    db.auditBatch.findUnique.mockResolvedValue({ id: "b", status: "completed", items: [] } as never);
    const res = await confirmBatch("b");
    expect(res.ok).toBe(true);
    expect(db.repoAudit.create).not.toHaveBeenCalled();
    expect(db.auditBatch.update).not.toHaveBeenCalled();
  });

  it("creates + enqueues a RepoAudit per will_audit item, links it, then flips the batch to running", async () => {
    db.auditBatch.findUnique.mockResolvedValue({
      id: "b",
      status: "estimated",
      items: [
        { id: "it1", repoId: "r1" },
        { id: "it2", repoId: "r2" },
      ],
    } as never);
    // No existing pending/running audit for either repo → both get created.
    db.repoAudit.findFirst.mockResolvedValue(null);
    db.repoAudit.create
      .mockResolvedValueOnce({ id: "audit_r1" } as never)
      .mockResolvedValueOnce({ id: "audit_r2" } as never);
    mockEnqueueAudit.mockResolvedValue(true);

    const res = await confirmBatch("b");

    expect(res.ok).toBe(true);
    expect(db.repoAudit.create).toHaveBeenCalledTimes(2);
    // Each created audit is pending and attributed to the gate login.
    expect(db.repoAudit.create.mock.calls[0][0].data).toMatchObject({
      repoId: "r1",
      status: "pending",
      provider: "anthropic",
      triggeredByLogin: ADMIN_LOGIN,
    });
    // The item is linked to its audit.
    expect(db.auditBatchItem.update).toHaveBeenCalledWith({
      where: { id: "it1" },
      data: { auditId: "audit_r1" },
    });
    // Both audits were enqueued.
    expect(mockEnqueueAudit).toHaveBeenCalledWith("audit_r1");
    expect(mockEnqueueAudit).toHaveBeenCalledWith("audit_r2");
    // Batch transitioned to running.
    expect(db.auditBatch.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "b" },
        data: expect.objectContaining({ status: "running" }),
      }),
    );
  });

  it("dedups: skips a repo that already has a pending/running audit (no create for it)", async () => {
    db.auditBatch.findUnique.mockResolvedValue({
      id: "b",
      status: "estimated",
      items: [
        { id: "it1", repoId: "r1" }, // already has an in-flight audit → skip
        { id: "it2", repoId: "r2" }, // fresh → create
      ],
    } as never);
    db.repoAudit.findFirst
      .mockResolvedValueOnce({ id: "existing_r1" } as never) // r1 in-flight
      .mockResolvedValueOnce(null); // r2 none
    db.repoAudit.create.mockResolvedValue({ id: "audit_r2" } as never);
    mockEnqueueAudit.mockResolvedValue(true);

    const res = await confirmBatch("b");

    expect(res.ok).toBe(true);
    // Only the non-duplicate repo produced a create/enqueue/link.
    expect(db.repoAudit.create).toHaveBeenCalledTimes(1);
    expect(db.repoAudit.create.mock.calls[0][0].data).toMatchObject({ repoId: "r2" });
    expect(mockEnqueueAudit).toHaveBeenCalledTimes(1);
    expect(mockEnqueueAudit).toHaveBeenCalledWith("audit_r2");
    // No item link was written for the skipped repo.
    expect(db.auditBatchItem.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "it1" } }),
    );
    // The in-flight guard queried by repo + live statuses.
    expect(db.repoAudit.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { repoId: "r1", status: { in: ["pending", "running"] } },
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// cancelBatch
// ---------------------------------------------------------------------------
describe("cancelBatch", () => {
  it("cancels when the guarded updateMany affects a row", async () => {
    db.auditBatch.updateMany.mockResolvedValue({ count: 1 } as never);
    const res = await cancelBatch("b");
    expect(res.ok).toBe(true);
    // Cancel is guarded to the estimated state so a running/completed batch can't be cancelled.
    expect(db.auditBatch.updateMany).toHaveBeenCalledWith({
      where: { id: "b", status: "estimated" },
      data: { status: "cancelled" },
    });
  });

  it("rejects when no estimated batch matched (count 0)", async () => {
    db.auditBatch.updateMany.mockResolvedValue({ count: 0 } as never);
    const res = await cancelBatch("b");
    expect(res.ok).toBe(false);
    expect(res.message).toMatch(/only an estimated batch/i);
  });
});

// ---------------------------------------------------------------------------
// getBatchState
// ---------------------------------------------------------------------------
describe("getBatchState", () => {
  it("flips a running batch to completed when all linked audits are terminal", async () => {
    db.auditBatch.findUnique.mockResolvedValue({
      id: "b",
      status: "running",
      totalEstimatedUsd: null,
      auditCount: 1,
      skippedCount: 1,
      items: [
        { repoId: "r1", decision: "will_audit", estimatedUsd: null, error: null, repo: { nameWithOwner: "o/r1" }, audit: { status: "completed" } },
        { repoId: "r2", decision: "will_audit", estimatedUsd: null, error: null, repo: { nameWithOwner: "o/r2" }, audit: { status: "failed" } },
      ],
    } as never);

    const view = await getBatchState("b");

    expect(view?.status).toBe("completed");
    // The lazy transition was actually persisted.
    expect(db.auditBatch.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "b" },
        data: expect.objectContaining({ status: "completed" }),
      }),
    );
    // Progress is computed from the linked audit statuses.
    expect(view?.progress).toEqual({ total: 2, completed: 1, failed: 1, running: 0, pending: 0 });
  });

  it("leaves a running batch running while a linked audit is still pending", async () => {
    db.auditBatch.findUnique.mockResolvedValue({
      id: "b",
      status: "running",
      totalEstimatedUsd: null,
      auditCount: 2,
      skippedCount: 0,
      items: [
        { repoId: "r1", decision: "will_audit", estimatedUsd: null, error: null, repo: { nameWithOwner: "o/r1" }, audit: { status: "completed" } },
        { repoId: "r2", decision: "will_audit", estimatedUsd: null, error: null, repo: { nameWithOwner: "o/r2" }, audit: { status: "pending" } },
      ],
    } as never);

    const view = await getBatchState("b");

    expect(view?.status).toBe("running");
    // No completion write while work is outstanding.
    expect(db.auditBatch.update).not.toHaveBeenCalled();
    expect(view?.progress).toEqual({ total: 2, completed: 1, failed: 0, running: 0, pending: 1 });
  });

  it("returns null when the batch does not exist", async () => {
    db.auditBatch.findUnique.mockResolvedValue(null);
    expect(await getBatchState("nope")).toBeNull();
  });
});
