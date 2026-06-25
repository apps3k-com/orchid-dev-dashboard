import { App } from "@octokit/app";
import { Octokit } from "@octokit/rest";
import { getAppConfig } from "@/server/config";

/** An org (or user) the App is installed on. */
export interface Installation {
  id: number;
  login: string;
}

/**
 * Build an Octokit App from the stored credentials. Throws if the instance has not
 * completed /setup. A webhook secret is required by the constructor type, so an inert
 * placeholder is used until webhooks are configured (v2).
 */
export async function getApp(): Promise<App> {
  const cfg = await getAppConfig();
  if (!cfg) throw new Error("GitHub App is not configured yet — complete /setup first.");
  return new App({
    appId: cfg.appId,
    privateKey: cfg.privateKey,
    oauth: { clientId: cfg.clientId, clientSecret: cfg.clientSecret },
    webhooks: { secret: cfg.webhookSecret ?? "orchid-webhooks-unconfigured" },
    // Use the @octokit/rest Octokit so app.octokit + installation clients expose
    // .rest, .paginate and .graphql (used by the sync layer).
    Octokit,
  });
}

/** List the installations (orgs/users) the App can access — the managed accounts. */
export async function listAppInstallations(): Promise<Installation[]> {
  const app = await getApp();
  const res = await app.octokit.request("GET /app/installations", { per_page: 100 });
  return res.data
    .map((inst) => {
      const account = inst.account;
      const login = account && "login" in account ? account.login : "";
      return { id: inst.id, login };
    })
    .filter((i) => i.login !== "");
}

/** An Octokit scoped to a single installation (for data reads/writes in later increments). */
export async function getInstallationOctokit(installationId: number) {
  const app = await getApp();
  return app.getInstallationOctokit(installationId);
}
