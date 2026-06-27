import { randomUUID } from "node:crypto";
import type { Repo } from "@prisma/client";
import { prisma } from "@/server/db";
import { getInstallationOctokit } from "@/server/github/app";
import { isNotFound } from "@/server/github/errors";
import { parseModulesYaml, renderModulesYaml } from "@/server/github/modules-yaml";

const MODULES_PATH = ".github/modules.yaml";

/** Resolve the installation-scoped Octokit for a repo's org (throws if not installed). */
async function octokitForRepo(repo: Repo) {
  const org = await prisma.org.findUnique({ where: { id: repo.orgId } });
  if (!org?.installationId) throw new Error(`Repo ${repo.nameWithOwner} has no installation.`);
  return getInstallationOctokit(org.installationId);
}

/** Split "owner/name" into its parts (throws on a malformed value). */
function splitOwnerName(nameWithOwner: string): { owner: string; name: string } {
  const [owner, name] = nameWithOwner.split("/");
  if (!owner || !name) throw new Error(`Invalid repository name: ${nameWithOwner}`);
  return { owner, name };
}

// Order-sensitive: a reorder is a real change (it changes the rendered file / dropdown order).
const sameModules = (a: string[], b: string[]): boolean =>
  a.length === b.length && a.every((x, i) => x === b[i]);

/** Read the repo's `.github/modules.yaml` from the default branch (empty list if absent). */
export async function getRepoModules(repo: Repo): Promise<string[]> {
  const octokit = await octokitForRepo(repo);
  const { owner, name } = splitOwnerName(repo.nameWithOwner);
  try {
    const res = await octokit.request("GET /repos/{owner}/{repo}/contents/{path}", {
      owner,
      repo: name,
      path: MODULES_PATH,
      ref: repo.defaultBranch,
    });
    if (Array.isArray(res.data) || res.data.type !== "file") return [];
    return parseModulesYaml(Buffer.from(res.data.content, "base64").toString("utf8"));
  } catch (error) {
    if (isNotFound(error)) return [];
    throw error;
  }
}

/** Propose a module-list change as a PR: render modules.yaml, branch off the default branch,
 *  commit the file, and open a PR. Returns the PR URL. Repo files only ever change via PR. */
export async function proposeModules(repo: Repo, modules: string[]): Promise<{ prUrl: string }> {
  const octokit = await octokitForRepo(repo);
  const { owner, name } = splitOwnerName(repo.nameWithOwner);
  const base = repo.defaultBranch;

  // Resolve the default-branch head FIRST, then read modules.yaml at that exact commit, so the
  // no-op check and the branch point stay consistent even if the default branch moves meanwhile.
  const ref = await octokit.request("GET /repos/{owner}/{repo}/git/ref/{ref}", {
    owner,
    repo: name,
    ref: `heads/${base}`,
  });
  const headSha = ref.data.object.sha;

  let sha: string | undefined;
  let current: string[] = [];
  try {
    const cur = await octokit.request("GET /repos/{owner}/{repo}/contents/{path}", {
      owner,
      repo: name,
      path: MODULES_PATH,
      ref: headSha,
    });
    if (!Array.isArray(cur.data) && cur.data.type === "file") {
      sha = cur.data.sha;
      current = parseModulesYaml(Buffer.from(cur.data.content, "base64").toString("utf8"));
    }
  } catch (error) {
    if (!isNotFound(error)) throw error;
  }

  const next = [...new Set(modules.map((m) => m.trim()).filter(Boolean))];
  if (sameModules(current, next)) {
    throw new Error("No changes to the module list.");
  }

  // Unique branch name (timestamp + random) so concurrent saves cannot collide on the same ref.
  const branch = `orchid/modules-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`;
  await octokit.request("POST /repos/{owner}/{repo}/git/refs", {
    owner,
    repo: name,
    ref: `refs/heads/${branch}`,
    sha: headSha,
  });

  // Commit the rendered file on the new branch.
  await octokit.request("PUT /repos/{owner}/{repo}/contents/{path}", {
    owner,
    repo: name,
    path: MODULES_PATH,
    branch,
    message: "chore(modules): update module taxonomy",
    content: Buffer.from(renderModulesYaml(next), "utf8").toString("base64"),
    sha,
  });

  // Open the PR against the default branch.
  const pr = await octokit.request("POST /repos/{owner}/{repo}/pulls", {
    owner,
    repo: name,
    base,
    head: branch,
    title: "chore(modules): update module taxonomy",
    body:
      "Updates `.github/modules.yaml` via the Orchid module editor.\n\n" +
      "After merge, the repo's issue-form options + labels sync propagates the module dropdowns and `module:*` labels.",
  });
  return { prUrl: pr.data.html_url };
}
