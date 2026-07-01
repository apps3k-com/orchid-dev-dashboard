import { quickAddJob } from "graphile-worker";

/** Enqueue a one-off `sync:all` job on the graphile-worker queue, processed by the in-process
 *  worker (see `startWorker`). Used by the manual "Refresh data" action so the HTTP request
 *  returns immediately instead of blocking on the full sync. A stable `jobKey` coalesces rapid
 *  repeat clicks into a single pending job. Returns `true` when a job was enqueued, or `false`
 *  when there is no DB configured (so callers don't falsely report a queued sync). */
export async function enqueueSyncAll(): Promise<boolean> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) return false;
  await quickAddJob({ connectionString }, "sync:all", undefined, { jobKey: "manual:sync:all" });
  return true;
}

/** Enqueue an `audit:run` job for a pending RepoAudit row (processed by the in-process worker).
 *  Returns `true` when enqueued, `false` when there is no DB configured. */
export async function enqueueAudit(auditId: string): Promise<boolean> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) return false;
  await quickAddJob({ connectionString }, "audit:run", { auditId });
  return true;
}

/** Enqueue an `audit:estimate` job for a pending AuditBatch. Coalesced per batch via `jobKey`.
 *  Returns `true` when enqueued, `false` when there is no DB configured. */
export async function enqueueBatchEstimate(batchId: string): Promise<boolean> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) return false;
  await quickAddJob({ connectionString }, "audit:estimate", { batchId }, { jobKey: `batch:estimate:${batchId}` });
  return true;
}
