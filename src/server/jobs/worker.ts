import { type Runner, run } from "graphile-worker";
import { syncAll } from "@/server/github/sync";
import { runAudit } from "@/server/llm/audit";

const globalForWorker = globalThis as unknown as { orchidWorker?: Runner };

/**
 * Start the in-process graphile-worker (idempotent across hot reloads). Keeps the bundle to
 * app + Postgres: the worker runs inside the Next server and refreshes the GitHub cache on a
 * schedule. graphile-worker installs its own schema on first run. Safe no-op without a DB.
 */
export async function startWorker(): Promise<void> {
  if (globalForWorker.orchidWorker) return;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) return;
  const runner = await run({
    connectionString,
    concurrency: 2,
    taskList: {
      "sync:all": async () => {
        await syncAll();
      },
      "audit:run": async (payload) => {
        const { auditId } = (payload ?? {}) as { auditId?: string };
        if (auditId) await runAudit(auditId);
      },
    },
    crontab: "*/5 * * * * sync:all",
  });
  globalForWorker.orchidWorker = runner;
}
