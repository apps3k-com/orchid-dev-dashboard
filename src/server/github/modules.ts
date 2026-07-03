import type { Repo } from "@prisma/client";
import { parseModulesYaml, renderModulesYaml } from "@/server/github/modules-yaml";
import { proposeFiles, repoClient } from "@/server/github/writeback";

const MODULES_PATH = ".github/modules.yaml";

// Read the modules file as a Blob. `object` is null when the file (or branch) is absent — a normal
// 200 response, unlike the REST Contents API's 404, which the Next dev overlay surfaces as a red
// "Console Error" on the modules page even though the caller handles it gracefully.
const MODULES_QUERY = `
  query($owner: String!, $name: String!, $expr: String!) {
    repository(owner: $owner, name: $name) {
      object(expression: $expr) {
        ... on Blob { text }
      }
    }
  }`;

interface ModulesBlobResult {
  repository: { object: { text?: string | null } | null } | null;
}

// Order-sensitive: a reorder is a real change (it changes the rendered file / dropdown order).
const sameModules = (a: string[], b: string[]): boolean =>
  a.length === b.length && a.every((x, i) => x === b[i]);

/** Read the repo's `.github/modules.yaml` from the default branch (empty list if absent).
 *  Uses GraphQL `object(expression:)` so an absent file resolves to `null` (a 200 response)
 *  instead of a 404; genuine errors (auth, rate-limit) still throw and are handled by the caller. */
export async function getRepoModules(repo: Repo): Promise<string[]> {
  const { octokit, owner, name, base } = await repoClient(repo);
  const res = await octokit.graphql<ModulesBlobResult>(MODULES_QUERY, {
    owner,
    name,
    expr: `${base}:${MODULES_PATH}`,
  });
  const text = res.repository?.object?.text;
  return text ? parseModulesYaml(text) : [];
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
