import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { Octokit } from "@octokit/rest";
import { createSession } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { appUrl } from "@/server/env";
import { getApp, listAppInstallations } from "@/server/github/app";
import { briefError } from "@/server/log";

/**
 * GitHub OAuth callback. Exchanges the code for a user token, requires the user to be an
 * active member of at least one org the App is installed on, upserts the user, and starts
 * a session. CSRF is checked via the `orchid_oauth_state` cookie set at /api/auth/login.
 */
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const code = params.get("code");
  const state = params.get("state");
  const jar = await cookies();
  const expected = jar.get("orchid_oauth_state")?.value;
  if (!code || !state || !expected || state !== expected) {
    return NextResponse.redirect(new URL("/login?error=state", appUrl()));
  }

  try {
    const app = await getApp();
    const { authentication } = await app.oauth.createToken({ state, code });
    const octokit = new Octokit({ auth: authentication.token });
    const { data: ghUser } = await octokit.request("GET /user");

    // Gate: the user must be an active member of a managed org (one the App is installed on).
    const installations = await listAppInstallations();
    let allowed = false;
    for (const inst of installations) {
      try {
        const membership = await octokit.request("GET /user/memberships/orgs/{org}", {
          org: inst.login,
        });
        if (membership.data.state === "active") {
          allowed = true;
          break;
        }
      } catch {
        // not a member of this org — keep checking
      }
    }
    if (!allowed) {
      return NextResponse.redirect(new URL("/login?error=not_member", appUrl()));
    }

    const user = await prisma.user.upsert({
      where: { githubId: ghUser.id },
      create: {
        githubId: ghUser.id,
        login: ghUser.login,
        name: ghUser.name ?? null,
        avatarUrl: ghUser.avatar_url,
        email: ghUser.email ?? null,
      },
      update: {
        login: ghUser.login,
        name: ghUser.name ?? null,
        avatarUrl: ghUser.avatar_url,
        email: ghUser.email ?? null,
      },
    });
    await createSession(user.id);

    const res = NextResponse.redirect(new URL("/dashboard", appUrl()));
    res.cookies.delete("orchid_oauth_state");
    return res;
  } catch (err) {
    // Don't 500 the browser on a misconfigured App / GitHub API hiccup — log + bounce to login.
    console.error("OAuth callback failed:", briefError(err).message);
    return NextResponse.redirect(new URL("/login?error=server", appUrl()));
  }
}
