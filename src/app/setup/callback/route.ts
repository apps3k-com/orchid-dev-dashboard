import { NextResponse } from "next/server";
import { Octokit } from "@octokit/rest";
import { saveAppConfig } from "@/server/config";
import { appUrl } from "@/server/env";

/**
 * GitHub App manifest callback. GitHub redirects here with a temporary `code` after the
 * user creates the App from the manifest; we convert it to permanent credentials, store
 * them (secrets encrypted), and send the user to install the App on their org(s).
 */
export async function GET(req: Request) {
  const code = new URL(req.url).searchParams.get("code");
  if (!code) {
    return NextResponse.redirect(new URL("/setup?error=nocode", appUrl()));
  }
  const octokit = new Octokit();
  const { data } = await octokit.request("POST /app-manifests/{code}/conversions", { code });
  await saveAppConfig({
    appId: data.id,
    slug: data.slug,
    clientId: data.client_id,
    privateKey: data.pem,
    clientSecret: data.client_secret,
    webhookSecret: data.webhook_secret ?? null,
  });
  const installUrl = data.slug
    ? `https://github.com/apps/${data.slug}/installations/new`
    : (data.html_url ?? appUrl());
  return NextResponse.redirect(installUrl);
}
