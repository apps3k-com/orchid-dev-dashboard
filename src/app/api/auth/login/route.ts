import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { isConfigured } from "@/server/config";
import { appUrl } from "@/server/env";
import { getApp } from "@/server/github/app";

/** Start the GitHub user-OAuth web flow (App user-to-server). Sets a CSRF state cookie. */
export async function GET() {
  if (!(await isConfigured())) {
    return NextResponse.redirect(new URL("/setup", appUrl()));
  }
  const app = await getApp();
  const state = randomBytes(16).toString("hex");
  const { url } = app.oauth.getWebFlowAuthorizationUrl({
    state,
    redirectUrl: `${appUrl()}/api/auth/callback`,
  });
  const res = NextResponse.redirect(url);
  res.cookies.set("orchid_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  return res;
}
