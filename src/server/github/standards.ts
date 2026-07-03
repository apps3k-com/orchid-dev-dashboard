import { getInstallationOctokit } from "@/server/github/app";
import { isNotFound } from "@/server/github/errors";
import { briefError } from "@/server/log";
import { prisma } from "@/server/db";

/** Whether a repo carries a given Tier-0 standard. */
export type StandardStatus = "present" | "missing";

/** The Tier-0 baseline standards Orchid tracks (keys, not free text). */
export type StandardKey =
  | "security-scan"
  | "dependabot"
  | "codeowners"
  | "license"
  | "security-policy"
  | "contributing"
  | "commitlint"
  | "secrets-model"
  | "ruleset-as-code";

/** A required file: a single exact path, or a set of interchangeable alternatives (any-of). */
type PathRule = string | string[];

/** One Tier-0 standard definition: present iff EVERY rule is satisfied by the repo's file set. */
export type StandardDef = {
  key: StandardKey;
  tier: 0;
  label: string;
  requires: PathRule[];
};

/** The canonical Tier-0 baseline, mirroring `apps3k-com/workflow-template` Epic #23. Presence is
 *  checked against a repo's committed file paths (a repo may place some files in `.github/`). */
export const TIER0_STANDARDS: StandardDef[] = [
  {
    key: "security-scan",
    tier: 0,
    label: "Security scanning (CodeQL + OSV)",
    requires: [".github/workflows/security-scan.yml"],
  },
  { key: "dependabot", tier: 0, label: "Dependabot", requires: [".github/dependabot.yml"] },
  {
    key: "codeowners",
    tier: 0,
    label: "CODEOWNERS",
    requires: [["CODEOWNERS", ".github/CODEOWNERS", "docs/CODEOWNERS"]],
  },
  { key: "license", tier: 0, label: "LICENSE", requires: [["LICENSE", "LICENSE.md", "LICENSE.txt"]] },
  {
    key: "security-policy",
    tier: 0,
    label: "SECURITY.md",
    requires: [["SECURITY.md", ".github/SECURITY.md", "docs/SECURITY.md"]],
  },
  {
    key: "contributing",
    tier: 0,
    label: "CONTRIBUTING.md",
    requires: [["CONTRIBUTING.md", ".github/CONTRIBUTING.md", "docs/CONTRIBUTING.md"]],
  },
  {
    key: "commitlint",
    tier: 0,
    label: "Commitlint (workflow + config)",
    requires: [
      ".github/workflows/commitlint.yml",
      [
        "commitlint.config.mjs",
        "commitlint.config.js",
        "commitlint.config.cjs",
        "commitlint.config.ts",
        ".commitlintrc",
        ".commitlintrc.json",
        ".commitlintrc.js",
        ".commitlintrc.yml",
      ],
    ],
  },
  { key: "secrets-model", tier: 0, label: "1Password secrets (.env.tmpl)", requires: [".env.tmpl"] },
  {
    key: "ruleset-as-code",
    tier: 0,
    label: "Ruleset-as-code",
    requires: ["scripts/github/provision-ruleset.mjs"],
  },
];

/** One standard's compliance for a repo. */
export type StandardState = {
  key: StandardKey;
  tier: number;
  label: string;
  status: StandardStatus;
};

function ruleSatisfied(rule: PathRule, paths: Set<string>): boolean {
  return Array.isArray(rule) ? rule.some((p) => paths.has(p)) : paths.has(rule);
}

/** Classify every Tier-0 standard as present/missing for a repo's committed file-path set
 *  (pure — unit-tested). A standard is present only when all of its required rules are satisfied. */
export function classifyStandards(paths: Set<string>): StandardState[] {
  return TIER0_STANDARDS.map((def) => ({
    key: def.key,
    tier: def.tier,
    label: def.label,
    status: def.requires.every((rule) => ruleSatisfied(rule, paths)) ? "present" : "missing",
  }));
}

/** The highest fully-satisfied adoption tier, or null if the Tier-0 baseline is incomplete (pure).
 *  Only Tier 0 is defined today; Tier 1/2 join as those standards ship in the template. */
export function computeTier(states: StandardState[]): number | null {
  const tier0 = states.filter((s) => s.tier === 0);
  const complete = tier0.length > 0 && tier0.every((s) => s.status === "present");
  return complete ? 0 : null;
}

/** The Tier-0 standard keys a repo is still missing (pure). */
export function tier0Gaps(states: StandardState[]): StandardKey[] {
  return states.filter((s) => s.tier === 0 && s.status === "missing").map((s) => s.key);
}

/** All committed blob paths in a repo tree at a ref (recursive). */
async function getRepoPaths(
  octokit: Awaited<ReturnType<typeof getInstallationOctokit>>,
  owner: string,
  name: string,
  ref: string,
): Promise<Set<string>> {
  const paths = new Set<string>();
  try {
    const res = await octokit.request("GET /repos/{owner}/{repo}/git/trees/{tree_sha}", {
      owner,
      repo: name,
      tree_sha: ref,
      recursive: "true",
    });
    if (res.data.truncated) {
      console.warn(`standards: tree truncated for ${owner}/${name}@${ref}; some files may be missed`);
    }
    for (const entry of res.data.tree) {
      if (entry.type === "blob" && entry.path) paths.add(entry.path);
    }
  } catch (error) {
    if (!isNotFound(error)) throw error;
  }
  return paths;
}

/** Refresh per-repo Tier-0 standards compliance (one `RepoStandard` row per repo + standard key).
 *  Unlike hook drift this needs no template repo — the baseline is defined in `TIER0_STANDARDS`.
 *  Returns the number of standard states written; a repo whose tree can't be read is left intact. */
export async function syncStandards(): Promise<number> {
  const repos = await prisma.repo.findMany({ include: { org: true } });
  let count = 0;
  for (const repo of repos) {
    if (!repo.org.installationId) continue;
    const [owner, name] = repo.nameWithOwner.split("/");
    if (!owner || !name) continue;

    let paths: Set<string>;
    try {
      const octokit = await getInstallationOctokit(repo.org.installationId);
      paths = await getRepoPaths(octokit, owner, name, repo.defaultBranch);
    } catch (error) {
      // Transient/repo error — skip this repo this run (its cached rows are left intact).
      console.warn(`standards: skipping ${repo.nameWithOwner}`, briefError(error));
      continue;
    }
    if (paths.size === 0) continue; // couldn't read the tree; don't wipe cached rows

    const states = classifyStandards(paths);
    for (const state of states) {
      await prisma.repoStandard.upsert({
        where: { repoId_key: { repoId: repo.id, key: state.key } },
        create: {
          repoId: repo.id,
          key: state.key,
          tier: state.tier,
          status: state.status,
          syncedAt: new Date(),
        },
        update: { tier: state.tier, status: state.status, syncedAt: new Date() },
      });
    }
    // Prune standards no longer tracked (keys removed from TIER0_STANDARDS).
    const keys = states.map((s) => s.key);
    await prisma.repoStandard.deleteMany({
      where: { repoId: repo.id, key: { notIn: keys.length > 0 ? keys : ["__none__"] } },
    });
    count += states.length;
  }
  return count;
}
