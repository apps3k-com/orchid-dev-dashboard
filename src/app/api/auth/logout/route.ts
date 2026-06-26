import { NextResponse } from "next/server";
import { destroySession } from "@/server/auth/session";
import { appUrl } from "@/server/env";

/** End the session (DB row + cookie) and return to the login page.
 *  POST-only: a GET handler would let a plain navigation (or a prefetched link)
 *  log the user out, so sign-out must be an explicit form submission. */
export async function POST() {
  await destroySession();
  return NextResponse.redirect(new URL("/login", appUrl()), { status: 303 });
}
