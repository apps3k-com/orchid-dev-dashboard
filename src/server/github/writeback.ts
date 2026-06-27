import { randomUUID } from "node:crypto";
import type { Repo } from "@prisma/client";
import { prisma } from "@/server/db";
import { getInstallationOctokit } from "@/server/github/app";
import { isNotFound } from "@/server/github/errors";

/** A file to write back to a repo: a repo-relative path and its full UTF-8 content. */
export type ProposedFile = { path: string; content: string };

/** Resolve the installation Octokit + owner/name/default-branch for a repo. Throws if the repo's
 *  org has no installation or the name is malformed. */
export async function repoClient(repo: Repo) {
  const org = await prisma.org.findUnique({ where: { id: repo.orgId } });
  if (!org?.installationId) throw new Error(`Repo ${repo.nameWithOwner} has no installation.`);
  const [owner, name] = repo.nameWithOwner.split("/");
  if (!owner || !name) throw new Error(`Invalid repository name: ${repo.nameWithOwner}`);
  const octokit = await getInstallationOctokit(org.installationId);
  return { octokit, owner, name, base: repo.defaultBranch };
}

/** Commit one or more files to a fresh branch off the default-branch head and open a PR.
 *  Returns the PR URL. This is Orchid's write-back primitive — repo files only change via PR. */
export async function proposeFiles(
  repo: Repo,
  files: ProposedFile[],
  opts: { branchPrefix: string; title: string; body: string; commitMessage: string },
): Promise<{ prUrl: string }> {
  const { octokit, owner, name, base } = await repoClient(repo);

  // Resolve the default-branch head once; the branch, blob reads and PR all hang off it.
  const ref = await octokit.request("GET /repos/{owner}/{repo}/git/ref/{ref}", {
    owner,
    repo: name,
    ref: `heads/${base}`,
  });
  const headSha = ref.data.object.sha;

  // Unique branch name (timestamp + random) so concurrent proposals cannot collide on a ref.
  const branch = `${opts.branchPrefix}-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`;
  await octokit.request("POST /repos/{owner}/{repo}/git/refs", {
    owner,
    repo: name,
    ref: `refs/heads/${branch}`,
    sha: headSha,
  });

  for (const file of files) {
    let sha: string | undefined;
    try {
      const cur = await octokit.request("GET /repos/{owner}/{repo}/contents/{path}", {
        owner,
        repo: name,
        path: file.path,
        ref: headSha,
      });
      if (!Array.isArray(cur.data) && cur.data.type === "file") sha = cur.data.sha;
    } catch (error) {
      if (!isNotFound(error)) throw error;
    }
    await octokit.request("PUT /repos/{owner}/{repo}/contents/{path}", {
      owner,
      repo: name,
      path: file.path,
      branch,
      message: opts.commitMessage,
      content: Buffer.from(file.content, "utf8").toString("base64"),
      sha,
    });
  }

  const pr = await octokit.request("POST /repos/{owner}/{repo}/pulls", {
    owner,
    repo: name,
    base,
    head: branch,
    title: opts.title,
    body: opts.body,
  });
  return { prUrl: pr.data.html_url };
}
