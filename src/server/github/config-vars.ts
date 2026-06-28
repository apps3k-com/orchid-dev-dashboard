import type { InstallationOctokit } from "@/server/github/app";
import { isConflict, isNotFound } from "@/server/github/errors";

/** Create-or-update an org-level Actions variable (visibility: all). Tolerates the create/update
 *  race: a 404 on PATCH falls back to POST, and a 409 on POST falls back to PATCH. */
export async function upsertOrgVariable(
  octokit: InstallationOctokit,
  orgLogin: string,
  name: string,
  value: string,
): Promise<void> {
  // Re-assert visibility on update too, so a variable previously created "private" still
  // becomes org-wide (otherwise new repos would not see it).
  const patch = () =>
    octokit.request("PATCH /orgs/{org}/actions/variables/{name}", {
      org: orgLogin,
      name,
      value,
      visibility: "all",
    });
  try {
    await patch();
    return;
  } catch (error) {
    if (!isNotFound(error)) throw error;
  }
  try {
    await octokit.request("POST /orgs/{org}/actions/variables", {
      org: orgLogin,
      name,
      value,
      visibility: "all",
    });
  } catch (error) {
    if (!isConflict(error)) throw error;
    await patch(); // created concurrently between our PATCH and POST
  }
}

/** Create-or-update a repository-level Actions variable. Tolerates the create/update race. */
export async function upsertRepoVariable(
  octokit: InstallationOctokit,
  owner: string,
  repo: string,
  name: string,
  value: string,
): Promise<void> {
  const patch = () =>
    octokit.request("PATCH /repos/{owner}/{repo}/actions/variables/{name}", {
      owner,
      repo,
      name,
      value,
    });
  try {
    await patch();
    return;
  } catch (error) {
    if (!isNotFound(error)) throw error;
  }
  try {
    await octokit.request("POST /repos/{owner}/{repo}/actions/variables", {
      owner,
      repo,
      name,
      value,
    });
  } catch (error) {
    if (!isConflict(error)) throw error;
    await patch();
  }
}
