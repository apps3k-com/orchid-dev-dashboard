import { NextResponse } from "next/server";
import { destroySession } from "@/server/auth/session";
import { appUrl } from "@/server/env";

/** End the session (DB row + cookie) and return to the login page. */
async function logout() {
  await destroySession();
  return NextResponse.redirect(new URL("/login", appUrl()), { status: 303 });
}

export const GET = logout;
export const POST = logout;
