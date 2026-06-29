import { App } from "@octokit/app";
import { Octokit } from "@octokit/rest";
import { getAppConfig } from "@/server/config";

/** An org (or user) the App is installed on. */
export interface Installation {
  id: number;
  login: string;
}

/**
 * Reconstruct a usable PEM from a GitHub App private key stored in env / secret managers.
 * Handles three encodings — real newlines (as-is), `\n`-escaped single line, and newlines
 * collapsed to spaces (some single-line secret stores, e.g. 1Password environments, do this).
 * Without this, `createPrivateKey` throws `ERR_OSSL_UNSUPPORTED` and both login and the
 * background sync fail.
 */
function normalizePrivateKey(key: string): string {
  if (key.includes("\n")) return key; // already a multi-line PEM
  if (key.includes("\\n")) return key.replace(/\\n/g, "\n"); // \n-escaped single line
  const m = key.match(/^(-----BEGIN [A-Z ]+-----)\s+([\s\S]*?)\s+(-----END [A-Z ]+-----)\s*$/);
  return m ? `${m[1]}\n${m[2].replace(/\s+/g, "\n")}\n${m[3]}\n` : key;
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
    privateKey: normalizePrivateKey(cfg.privateKey),
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

/** The installation-scoped Octokit type (used to type write helpers). */
export type InstallationOctokit = Awaited<ReturnType<typeof getInstallationOctokit>>;
