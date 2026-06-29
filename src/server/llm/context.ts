import type { Repo } from "@prisma/client";

import { isNotFound } from "@/server/github/errors";
import { repoClient } from "@/server/github/writeback";
import { auditPathPriority, isAuditPath } from "@/server/llm/audit-scope";

// Char-based bounds (a rough token proxy) so a big repo can't blow the context window / cost.
const PER_FILE_CHARS = 24_000;
const TOTAL_CHARS = 360_000;

/** One collected config file. */
export type AuditFile = { path: string; content: string };

/** The bounded config set for one audit, plus the commit it was read at, anything dropped by the
 *  size cap (`omitted`), and whether the git tree itself was truncated (an incomplete listing). */
export type AuditContext = {
  files: AuditFile[];
  commitSha: string;
  omitted: string[];
  truncated: boolean;
};

/** Collect a repo's agent/hook config files (`.claude/**`, `.codex/**`, `.github/workflows/*`,
 *  `AGENTS.md`/`CLAUDE.md`/`CODEX.md`, `.coderabbit.yaml`, `docs/agents/*`) at the default-branch
 *  head, in priority order, bounded per-file and overall. Files dropped by the cap are reported in
 *  `omitted` (never silently). */
export async function collectAuditContext(repo: Repo): Promise<AuditContext> {
  const { octokit, owner, name, base } = await repoClient(repo);

  const ref = await octokit.request("GET /repos/{owner}/{repo}/git/ref/{ref}", {
    owner,
    repo: name,
    ref: `heads/${base}`,
  });
  const commitSha = ref.data.object.sha;

  const tree = await octokit.request("GET /repos/{owner}/{repo}/git/trees/{tree_sha}", {
    owner,
    repo: name,
    tree_sha: commitSha,
    recursive: "true",
  });
  const truncated = Boolean(tree.data.truncated);
  if (truncated) {
    console.warn(`audit: tree truncated for ${owner}/${name}; some config files may be missed`);
  }

  const blobs = tree.data.tree
    .filter((e) => e.type === "blob" && e.path && e.sha && isAuditPath(e.path))
    .map((e) => ({ path: e.path as string, sha: e.sha as string }))
    .sort(
      (a, b) => auditPathPriority(a.path) - auditPathPriority(b.path) || a.path.localeCompare(b.path),
    );

  const files: AuditFile[] = [];
  const omitted: string[] = [];
  let total = 0;
  for (const blob of blobs) {
    if (total >= TOTAL_CHARS) {
      omitted.push(blob.path);
      continue;
    }
    try {
      const res = await octokit.request("GET /repos/{owner}/{repo}/git/blobs/{file_sha}", {
        owner,
        repo: name,
        file_sha: blob.sha,
      });
      let content =
        res.data.encoding === "base64"
          ? Buffer.from(res.data.content, "base64").toString("utf8")
          : res.data.content;
      if (content.length > PER_FILE_CHARS) {
        content = `${content.slice(0, PER_FILE_CHARS)}\n…[truncated]`;
      }
      if (total + content.length > TOTAL_CHARS) {
        omitted.push(blob.path);
        continue;
      }
      files.push({ path: blob.path, content });
      total += content.length;
    } catch (error) {
      if (!isNotFound(error)) throw error;
    }
  }

  return { files, commitSha, omitted, truncated };
}
