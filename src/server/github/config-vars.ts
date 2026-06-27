import type { InstallationOctokit } from "@/server/github/app";
import { isNotFound } from "@/server/github/errors";

/** Create-or-update an org-level Actions variable (visibility: all). */
export async function upsertOrgVariable(
  octokit: InstallationOctokit,
  orgLogin: string,
  name: string,
  value: string,
): Promise<void> {
  try {
    await octokit.request("PATCH /orgs/{org}/actions/variables/{name}", {
      org: orgLogin,
      name,
      value,
    });
  } catch (error) {
    if (!isNotFound(error)) throw error;
    await octokit.request("POST /orgs/{org}/actions/variables", {
      org: orgLogin,
      name,
      value,
      visibility: "all",
    });
  }
}

/** Create-or-update a repository-level Actions variable. */
export async function upsertRepoVariable(
  octokit: InstallationOctokit,
  owner: string,
  repo: string,
  name: string,
  value: string,
): Promise<void> {
  try {
    await octokit.request("PATCH /repos/{owner}/{repo}/actions/variables/{name}", {
      owner,
      repo,
      name,
      value,
    });
  } catch (error) {
    if (!isNotFound(error)) throw error;
    await octokit.request("POST /repos/{owner}/{repo}/actions/variables", {
      owner,
      repo,
      name,
      value,
    });
  }
}
