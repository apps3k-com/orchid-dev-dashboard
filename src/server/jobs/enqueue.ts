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
