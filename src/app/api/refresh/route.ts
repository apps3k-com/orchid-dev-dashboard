import { NextResponse } from "next/server";
import { getSessionUser } from "@/server/auth/session";
import { appUrl } from "@/server/env";
import { syncAll } from "@/server/github/sync";

/** Manually refresh the GitHub cache (installations → repos → open PRs). Auth-gated. */
export async function POST() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    await syncAll();
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
  return NextResponse.redirect(new URL("/dashboard", appUrl()), { status: 303 });
}
