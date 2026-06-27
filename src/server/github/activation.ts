import type { Org, Repo } from "@prisma/client";
import { getAppConfig } from "@/server/config";
import { getInstallationOctokit } from "@/server/github/app";
import { upsertOrgVariable, upsertRepoVariable } from "@/server/github/config-vars";
import { isNotFound } from "@/server/github/errors";
import { sealSecret } from "@/server/github/secrets";
import { repoClient } from "@/server/github/writeback";

/** True when `login` is a member of the org — gate sensitive writes (secrets) to org members. */
export async function isOrgMember(org: Org, login: string): Promise<boolean> {
  if (!org.installationId) return false;
  const octokit = await getInstallationOctokit(org.installationId);
  try {
    await octokit.request("GET /orgs/{org}/members/{username}", {
      org: org.login,
      username: login,
    });
    return true;
  } catch (error) {
    if (isNotFound(error)) return false;
    throw error;
  }
}

/** Org variable holding the App id; org secret holding the App private key. Recipes read these
 *  to mint an App token at runtime. Kept at org level so the key lives in exactly one place. */
export const APP_ID_VAR = "ORCHID_APP_ID";
export const APP_KEY_SECRET = "ORCHID_APP_PRIVATE_KEY";

/** Provision the org-level App credentials for a recipe install: ORCHID_APP_ID (org variable, not
 *  sensitive) + ORCHID_APP_PRIVATE_KEY (sealed org secret). The secret is scoped to SELECTED
 *  repositories — only repos that actually use an automation can read the key — and `repo` is
 *  added to that allow-list (preserving any already granted). Idempotent. */
export async function setOrgAppCredentials(org: Org, repo: Repo): Promise<void> {
  if (!org.installationId) throw new Error(`Org ${org.login} has no installation.`);
  const config = await getAppConfig();
  if (!config) throw new Error("GitHub App is not configured.");
  const octokit = await getInstallationOctokit(org.installationId);

  await upsertOrgVariable(octokit, org.login, APP_ID_VAR, String(config.appId));

  // Existing allow-list (empty if the secret doesn't exist yet), plus this repo.
  let selected: number[] = [];
  try {
    const current = await octokit.request(
      "GET /orgs/{org}/actions/secrets/{secret_name}/repositories",
      { org: org.login, secret_name: APP_KEY_SECRET },
    );
    selected = current.data.repositories.map((r) => r.id);
  } catch (error) {
    if (!isNotFound(error)) throw error;
  }
  const selectedRepositoryIds = [...new Set([...selected, repo.githubId])];

  const pk = await octokit.request("GET /orgs/{org}/actions/secrets/public-key", {
    org: org.login,
  });
  const encrypted = await sealSecret(config.privateKey, pk.data.key);
  await octokit.request("PUT /orgs/{org}/actions/secrets/{secret_name}", {
    org: org.login,
    secret_name: APP_KEY_SECRET,
    encrypted_value: encrypted,
    key_id: pk.data.key_id,
    visibility: "selected",
    selected_repository_ids: selectedRepositoryIds,
  });
}

/** Set a recipe's per-repo configuration as repository variables (e.g. ORCHID_PROJECT_URL). */
export async function setRepoConfig(repo: Repo, config: Record<string, string>): Promise<void> {
  const { octokit, owner, name } = await repoClient(repo);
  for (const [key, value] of Object.entries(config)) {
    await upsertRepoVariable(octokit, owner, name, key, value);
  }
}
