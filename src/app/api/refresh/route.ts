import { NextResponse } from "next/server";
import { getSessionUser } from "@/server/auth/session";
import { appUrl } from "@/server/env";
import { enqueueSyncAll } from "@/server/jobs/enqueue";
import { briefError } from "@/server/log";

/** Manually trigger a GitHub cache refresh. Enqueues a `sync:all` job on the worker and returns
 *  immediately (the sync runs in the background) so the request never blocks on N GitHub calls.
 *  Auth-gated. */
export async function POST() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  let queued = false;
  try {
    queued = await enqueueSyncAll();
  } catch (error) {
    return NextResponse.json({ error: briefError(error).message }, { status: 500 });
  }
  // Only signal "queued" when a job was actually enqueued (no DB → no-op → no false promise).
  return NextResponse.redirect(new URL(queued ? "/dashboard?queued=1" : "/dashboard", appUrl()), {
    status: 303,
  });
}
