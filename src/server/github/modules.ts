import type { Repo } from "@prisma/client";
import { isNotFound } from "@/server/github/errors";
import { parseModulesYaml, renderModulesYaml } from "@/server/github/modules-yaml";
import { proposeFiles, repoClient } from "@/server/github/writeback";

const MODULES_PATH = ".github/modules.yaml";

// Order-sensitive: a reorder is a real change (it changes the rendered file / dropdown order).
const sameModules = (a: string[], b: string[]): boolean =>
  a.length === b.length && a.every((x, i) => x === b[i]);

/** Read the repo's `.github/modules.yaml` from the default branch (empty list if absent). */
export async function getRepoModules(repo: Repo): Promise<string[]> {
  const { octokit, owner, name, base } = await repoClient(repo);
  try {
    const res = await octokit.request("GET /repos/{owner}/{repo}/contents/{path}", {
      owner,
      repo: name,
      path: MODULES_PATH,
      ref: base,
    });
    if (Array.isArray(res.data) || res.data.type !== "file") return [];
    return parseModulesYaml(Buffer.from(res.data.content, "base64").toString("utf8"));
  } catch (error) {
    if (isNotFound(error)) return [];
    throw error;
  }
}

/** Propose a module-list change as a PR (no-op guard avoids empty PRs). Repo files change via PR. */
export async function proposeModules(repo: Repo, modules: string[]): Promise<{ prUrl: string }> {
  const current = await getRepoModules(repo);
  const next = [...new Set(modules.map((m) => m.trim()).filter(Boolean))];
  if (sameModules(current, next)) {
    throw new Error("No changes to the module list.");
  }
  return proposeFiles(repo, [{ path: MODULES_PATH, content: renderModulesYaml(next) }], {
    branchPrefix: "orchid/modules",
    commitMessage: "chore(modules): update module taxonomy",
    title: "chore(modules): update module taxonomy",
    body:
      "Updates `.github/modules.yaml` via the Orchid module editor.\n\n" +
      "After merge, the repo's issue-form options + labels sync propagates the module dropdowns and `module:*` labels.",
  });
}
