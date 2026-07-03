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

/** Read the repo's `.github/modules.yaml` from the default branch. Only a genuinely absent file
 *  (`object === null`) yields an empty list; an inaccessible repository (`repository === null`) or a
 *  non-text blob (`text === null`, e.g. a binary file) throws, so read failures are never silently
 *  reported as "no modules". Uses GraphQL `object(expression:)` so an absent file resolves to `null`
 *  (a 200 response) instead of a 404 that the Next dev overlay would surface as a red Console Error. */
export async function getRepoModules(repo: Repo): Promise<string[]> {
  const { octokit, owner, name, base } = await repoClient(repo);
  const res = await octokit.graphql<ModulesBlobResult>(MODULES_QUERY, {
    owner,
    name,
    expr: `${base}:${MODULES_PATH}`,
  });

  // A null repository can't be resolved or accessed (auth/permission) — a real failure, not an absent
  // file. GitHub normally attaches an errors[] entry (so octokit already throws), but guard explicitly
  // so it can never be misread as "no modules".
  if (!res.repository) {
    throw new Error(`getRepoModules: repository ${owner}/${name} not found or inaccessible`);
  }
  // A null object is the file (or branch) genuinely absent → no modules configured yet.
  const object = res.repository.object;
  if (object == null) return [];
  // The path resolved to something other than readable UTF-8 text (a binary blob, tree, submodule…).
  // Surface it rather than silently reporting "no modules".
  if (typeof object.text !== "string") {
    throw new Error(`getRepoModules: ${MODULES_PATH} in ${owner}/${name} is not a readable text file`);
  }
  return parseModulesYaml(object.text);
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
