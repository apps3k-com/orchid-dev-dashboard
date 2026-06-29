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
  const parts = repo.nameWithOwner.split("/");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error(`Invalid repository name: ${repo.nameWithOwner}`);
  }
  const [owner, name] = parts;
  const octokit = await getInstallationOctokit(org.installationId);
  return { octokit, owner, name, base: repo.defaultBranch };
}

/** Commit one or more files to a fresh branch off the default-branch head and open a PR.
 *  Returns the PR URL. This is Orchid's write-back primitive — repo files only change via PR.
 *
 *  `opts.mustExist` enforces that every file already exists at the resolved head (no create-on-absent)
 *  — checked against the SAME snapshot used for the writes, before any remote write. On failure the
 *  thrown error carries `remoteWriteStarted` (true once the branch was created): callers can release a
 *  reservation safely only when it's false, since a post-write retry would open a duplicate PR. */
export async function proposeFiles(
  repo: Repo,
  files: ProposedFile[],
  opts: {
    branchPrefix: string;
    title: string;
    body: string;
    commitMessage: string;
    mustExist?: boolean;
  },
): Promise<{ prUrl: string }> {
  const { octokit, owner, name, base } = await repoClient(repo);
  let remoteWriteStarted = false;

  try {
    // Resolve the default-branch head once; the branch, blob reads and PR all hang off it.
    const ref = await octokit.request("GET /repos/{owner}/{repo}/git/ref/{ref}", {
      owner,
      repo: name,
      ref: `heads/${base}`,
    });
    const headSha = ref.data.object.sha;

    // Resolve each file's current blob sha at the head BEFORE any write, so `mustExist` fails
    // pre-write (no orphan branch) and the PUTs carry the snapshot-correct sha.
    const planned: Array<ProposedFile & { sha: string | undefined }> = [];
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
      if (opts.mustExist && sha === undefined) {
        throw new Error(`File ${file.path} does not exist on ${base} — refusing to create it.`);
      }
      planned.push({ ...file, sha });
    }

    // Unique branch name (timestamp + random) so concurrent proposals cannot collide on a ref.
    const branch = `${opts.branchPrefix}-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`;
    await octokit.request("POST /repos/{owner}/{repo}/git/refs", {
      owner,
      repo: name,
      ref: `refs/heads/${branch}`,
      sha: headSha,
    });
    remoteWriteStarted = true;

    for (const file of planned) {
      await octokit.request("PUT /repos/{owner}/{repo}/contents/{path}", {
        owner,
        repo: name,
        path: file.path,
        branch,
        message: opts.commitMessage,
        content: Buffer.from(file.content, "utf8").toString("base64"),
        sha: file.sha,
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
  } catch (error) {
    if (error && typeof error === "object") {
      (error as { remoteWriteStarted?: boolean }).remoteWriteStarted = remoteWriteStarted;
    }
    throw error;
  }
}
