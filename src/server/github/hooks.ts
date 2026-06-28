import { type InstallationOctokit, getInstallationOctokit } from "@/server/github/app";
import { isNotFound } from "@/server/github/errors";
import { prisma } from "@/server/db";

// The agent-hook surface compared against the canonical template.
const HOOK_PREFIXES = [".claude/", ".codex/"];

export type HookStatus = "match" | "outdated" | "missing" | "extra";

/** One agent-hook file's drift vs the canonical template. */
export type HookFileState = {
  path: string;
  status: HookStatus;
  repoSha: string | null;
  templateSha: string | null;
};

/** Classify each agent-hook path by comparing the template vs repo blob SHAs (pure — unit-tested):
 *  match (same sha), outdated (both, different sha), missing (template only), extra (repo only). */
export function classifyHooks(
  template: Map<string, string>,
  repo: Map<string, string>,
): HookFileState[] {
  const paths = [...new Set([...template.keys(), ...repo.keys()])].sort();
  return paths.map((path) => {
    const templateSha = template.get(path) ?? null;
    const repoSha = repo.get(path) ?? null;
    const status: HookStatus =
      templateSha && repoSha
        ? templateSha === repoSha
          ? "match"
          : "outdated"
        : templateSha
          ? "missing"
          : "extra";
    return { path, status, repoSha, templateSha };
  });
}

/** Map of agent-hook file path -> blob SHA on a ref (recursive tree, filtered to .claude/.codex). */
async function getHookTree(
  octokit: InstallationOctokit,
  owner: string,
  name: string,
  ref: string,
): Promise<Map<string, string>> {
  const tree = new Map<string, string>();
  try {
    const res = await octokit.request("GET /repos/{owner}/{repo}/git/trees/{tree_sha}", {
      owner,
      repo: name,
      tree_sha: ref,
      recursive: "true",
    });
    if (res.data.truncated) {
      console.warn(`hooks: tree truncated for ${owner}/${name}@${ref}; some files may be missed`);
    }
    for (const entry of res.data.tree) {
      const path = entry.path;
      if (
        entry.type === "blob" &&
        path &&
        entry.sha &&
        HOOK_PREFIXES.some((prefix) => path.startsWith(prefix))
      ) {
        tree.set(path, entry.sha);
      }
    }
  } catch (error) {
    if (!isNotFound(error)) throw error;
  }
  return tree;
}

/** Refresh per-repo agent-hook drift vs the canonical template (ORCHID_TEMPLATE_REPO). Returns
 *  the number of file states written. No-op when no template repo is configured/installed. */
export async function syncHooks(): Promise<number> {
  const templateRepo = process.env.ORCHID_TEMPLATE_REPO;
  if (!templateRepo) return 0;
  const [tOwner, tName] = templateRepo.split("/");
  if (!tOwner || !tName) return 0;

  const tOrg = await prisma.org.findFirst({ where: { login: tOwner } });
  if (!tOrg?.installationId) return 0;
  const tOctokit = await getInstallationOctokit(tOrg.installationId);

  let templateBranch: string;
  try {
    const info = await tOctokit.request("GET /repos/{owner}/{repo}", { owner: tOwner, repo: tName });
    templateBranch = info.data.default_branch;
  } catch (error) {
    if (isNotFound(error)) return 0;
    throw error;
  }
  const templateTree = await getHookTree(tOctokit, tOwner, tName, templateBranch);
  if (templateTree.size === 0) return 0; // nothing to compare against

  const repos = await prisma.repo.findMany({ include: { org: true } });
  let count = 0;
  for (const repo of repos) {
    if (!repo.org.installationId || repo.nameWithOwner === templateRepo) continue;
    const [owner, name] = repo.nameWithOwner.split("/");
    if (!owner || !name) continue;

    let repoTree: Map<string, string>;
    try {
      const octokit = await getInstallationOctokit(repo.org.installationId);
      repoTree = await getHookTree(octokit, owner, name, repo.defaultBranch);
    } catch {
      continue; // transient/repo error — skip this repo this run
    }

    const states = classifyHooks(templateTree, repoTree);
    const seen: string[] = [];
    for (const state of states) {
      await prisma.repoHookState.upsert({
        where: { repoId_path: { repoId: repo.id, path: state.path } },
        create: {
          repoId: repo.id,
          path: state.path,
          status: state.status,
          repoSha: state.repoSha,
          templateSha: state.templateSha,
          syncedAt: new Date(),
        },
        update: {
          status: state.status,
          repoSha: state.repoSha,
          templateSha: state.templateSha,
          syncedAt: new Date(),
        },
      });
      seen.push(state.path);
    }
    await prisma.repoHookState.deleteMany({
      where: { repoId: repo.id, path: { notIn: seen.length > 0 ? seen : ["__none__"] } },
    });
    count += states.length;
  }
  return count;
}
