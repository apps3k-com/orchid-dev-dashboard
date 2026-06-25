/**
 * Next.js instrumentation hook — runs once when the server boots. Starts the in-process
 * background worker (only in the Node.js runtime; skipped on edge and when no DB is set, e.g.
 * during build). Failures are logged, never fatal to the web server.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  try {
    const { startWorker } = await import("@/server/jobs/worker");
    await startWorker();
  } catch (error) {
    console.error("Orchid: background worker failed to start", error);
  }
}
