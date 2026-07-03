"use server";

import { getSessionUser } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { getInstallationOctokit } from "@/server/github/app";
import { fetchPullTimeline, type PullTimeline } from "@/server/github/pull-timeline";
import { briefError } from "@/server/log";

/** Server action: load a cached PR's live timeline (comments, reviews, commits, label/state events)
 *  for the /pulls detail modal. The cache stores only PR summaries, so this fetches live via GraphQL.
 *  Read-only + gated to a signed-in session (same exposure as the /pulls board itself). Returns null
 *  on any failure so the modal shows a graceful empty state. */
export async function getPullTimeline(pullRequestId: string): Promise<PullTimeline | null> {
  const user = await getSessionUser();
  if (!user) return null;

  // All failures (DB, Octokit, GraphQL) funnel through one catch so the action honors its
  // "returns null on any failure" contract and every failure is logged server-side.
  try {
    const pr = await prisma.pullRequest.findUnique({
      where: { id: pullRequestId },
      include: { repo: { include: { org: true } } },
    });
    if (!pr?.repo.org.installationId) return null;

    const [owner] = pr.repo.nameWithOwner.split("/");
    const octokit = await getInstallationOctokit(pr.repo.org.installationId);
    return await fetchPullTimeline({ octokit, owner, name: pr.repo.name, number: pr.number });
  } catch (error) {
    console.warn("getPullTimeline failed", briefError(error));
    return null;
  }
}
