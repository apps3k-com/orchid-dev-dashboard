import type { Org, Repo } from "@prisma/client";
import { getAppConfig } from "@/server/config";
import { getInstallationOctokit } from "@/server/github/app";
import { upsertOrgVariable, upsertRepoVariable } from "@/server/github/config-vars";
import { sealSecret } from "@/server/github/secrets";
import { repoClient } from "@/server/github/writeback";

/** Org variable holding the App id; org secret holding the App private key. Recipes read these
 *  to mint an App token at runtime. Kept at org level so the key lives in exactly one place. */
export const APP_ID_VAR = "ORCHID_APP_ID";
export const APP_KEY_SECRET = "ORCHID_APP_PRIVATE_KEY";

/** Provision the org-level App credentials: ORCHID_APP_ID (variable) + ORCHID_APP_PRIVATE_KEY
 *  (sealed org secret, visibility all). Idempotent. Needs the org variables + secrets permissions. */
export async function setOrgAppCredentials(org: Org): Promise<void> {
  if (!org.installationId) throw new Error(`Org ${org.login} has no installation.`);
  const config = await getAppConfig();
  if (!config) throw new Error("GitHub App is not configured.");
  const octokit = await getInstallationOctokit(org.installationId);

  await upsertOrgVariable(octokit, org.login, APP_ID_VAR, String(config.appId));

  const pk = await octokit.request("GET /orgs/{org}/actions/secrets/public-key", {
    org: org.login,
  });
  const encrypted = await sealSecret(config.privateKey, pk.data.key);
  await octokit.request("PUT /orgs/{org}/actions/secrets/{secret_name}", {
    org: org.login,
    secret_name: APP_KEY_SECRET,
    encrypted_value: encrypted,
    key_id: pk.data.key_id,
    visibility: "all",
  });
}

/** Set a recipe's per-repo configuration as repository variables (e.g. ORCHID_PROJECT_URL). */
export async function setRepoConfig(repo: Repo, config: Record<string, string>): Promise<void> {
  const { octokit, owner, name } = await repoClient(repo);
  for (const [key, value] of Object.entries(config)) {
    await upsertRepoVariable(octokit, owner, name, key, value);
  }
}
