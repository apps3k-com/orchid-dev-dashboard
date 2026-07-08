import type { PullRequest } from "@prisma/client";

import { prisma } from "@/server/db";
import { getInstallationOctokit } from "@/server/github/app";
import { briefError } from "@/server/log";

/** What kind of human decision an item asks for (drives priority + rendering). */
export type DecisionKind =
  | "failing_checks"
  | "agent_waiting" // reserved for phase B (AgentTask waiting_for_user)
  | "unresolved_threads"
  | "ready_to_merge"
  | "audit_finding"
  | "batch_failed";

/** One entry of the Decision Queue: something that needs the human's call, with a 1-click way in. */
export interface DecisionItem {
  /** Stable identity of the CURRENT state — dismissals bind to it and expire when it changes. */
  dedupeKey: string;
  kind: DecisionKind;
  /** Lower = more urgent (see PRIORITY). */
  priority: number;
  repo: string | null;
  title: string;
  detail: string | null;
  externalUrl: string | null;
  occurredAt: Date;
}

// Documented priority order: failing checks > waiting agent > unresolved review threads >
// ready-to-merge > audit findings > failed fleet batches.
const PRIORITY: Record<DecisionKind, number> = {
  failing_checks: 1,
  agent_waiting: 2,
  unresolved_threads: 3,
  ready_to_merge: 4,
  audit_finding: 5,
  batch_failed: 6,
};

// Bound the live review-thread lookups per queue build (solo fleets stay far below this).
const MAX_THREAD_CHECKS = 30;

/**
 * Classify a cached open PR for the Decision Queue (pure — unit-tested): failing checks beat
 * everything; "ready to merge" requires approved + green + non-draft + not conflicting.
 * Returns null when the PR needs nothing from the human right now.
 */
export function classifyPull(pr: {
  checksState: string | null;
  reviewDecision: string | null;
  isDraft: boolean;
  mergeable: string | null;
}): Extract<DecisionKind, "failing_checks" | "ready_to_merge"> | null {
  if (pr.checksState === "FAILURE" || pr.checksState === "ERROR") return "failing_checks";
  if (
    !pr.isDraft &&
    pr.reviewDecision === "APPROVED" &&
    pr.checksState === "SUCCESS" &&
    pr.mergeable !== "CONFLICTING"
  ) {
    return "ready_to_merge";
  }
  return null;
}

/**
 * Order queue items by priority, then by age (oldest first), and drop dismissed keys
 * (pure — unit-tested). Dismissals bind to the dedupeKey, so a state change (new key)
 * automatically resurfaces the item.
 */
export function prioritizeDecisions(items: DecisionItem[], dismissedKeys: Set<string>): DecisionItem[] {
  return items
    .filter((item) => !dismissedKeys.has(item.dedupeKey))
    .sort((a, b) => a.priority - b.priority || a.occurredAt.getTime() - b.occurredAt.getTime());
}

/** Build a queue item from a cached PR + its classification (pure — unit-tested). */
export function buildPullItem(
  pr: Pick<PullRequest, "nodeId" | "number" | "title" | "url" | "checksState" | "ghUpdatedAt" | "syncedAt">,
  repoName: string,
  kind: Extract<DecisionKind, "failing_checks" | "ready_to_merge">,
): DecisionItem {
  return {
    // failing-checks keys include the state so a re-run that flips the state resets dismissals.
    dedupeKey:
      kind === "failing_checks"
        ? `decision:pr-checks:${pr.nodeId}:${pr.checksState}`
        : `decision:pr-ready:${pr.nodeId}`,
    kind,
    priority: PRIORITY[kind],
    repo: repoName,
    title:
      kind === "failing_checks"
        ? `Checks failing on PR #${pr.number}: ${pr.title}`
        : `Ready to merge: PR #${pr.number}: ${pr.title}`,
    detail: null,
    externalUrl: pr.url,
    occurredAt: pr.ghUpdatedAt ?? pr.syncedAt,
  };
}

const THREADS_QUERY = `
  query($owner: String!, $name: String!, $number: Int!) {
    repository(owner: $owner, name: $name) {
      pullRequest(number: $number) {
        reviewThreads(first: 100) {
          nodes {
            isResolved
            comments(first: 1) { nodes { author { login } } }
          }
        }
      }
    }
  }`;

interface ThreadsResult {
  repository: {
    pullRequest: {
      reviewThreads: {
        nodes: Array<{
          isResolved: boolean;
          comments: { nodes: Array<{ author: { login: string } | null }> };
        } | null>;
      };
    } | null;
  } | null;
}

/** Count a PR's unresolved review threads opened by CodeRabbit (pure over the GraphQL shape). */
export function countUnresolvedCodeRabbitThreads(result: ThreadsResult): number {
  const nodes = result.repository?.pullRequest?.reviewThreads.nodes ?? [];
  return nodes.filter(
    (t) => t && !t.isResolved && (t.comments.nodes[0]?.author?.login ?? "").includes("coderabbit"),
  ).length;
}

/**
 * Assemble the Decision Queue (compute-on-read): failing/ready PRs from the cache, unresolved
 * CodeRabbit threads live via GraphQL (bounded + per-org fail-open so one API hiccup never
 * blanks the queue), open auto-fixable audit findings, and failed fleet batches. Dismissed
 * items are filtered by their dedupeKey. Server-only.
 */
export async function getDecisionQueue(): Promise<DecisionItem[]> {
  const items: DecisionItem[] = [];

  const pulls = await prisma.pullRequest.findMany({
    where: { state: "OPEN" },
    include: { repo: { include: { org: true } } },
  });

  for (const pr of pulls) {
    const kind = classifyPull(pr);
    if (kind) items.push(buildPullItem(pr, pr.repo.nameWithOwner, kind));
  }

  // Live CodeRabbit-thread check, grouped per org; an org's first failure skips its remaining
  // PRs (degrade gracefully instead of hammering a broken installation).
  const byOrg = new Map<number, typeof pulls>();
  for (const pr of pulls.slice(0, MAX_THREAD_CHECKS)) {
    const installationId = pr.repo.org.installationId;
    if (!installationId) continue;
    byOrg.set(installationId, [...(byOrg.get(installationId) ?? []), pr]);
  }
  for (const [installationId, orgPulls] of byOrg) {
    try {
      const octokit = await getInstallationOctokit(installationId);
      for (const pr of orgPulls) {
        const [owner, name] = pr.repo.nameWithOwner.split("/");
        if (!owner || !name) continue;
        const res = await octokit.graphql<ThreadsResult>(THREADS_QUERY, {
          owner,
          name,
          number: pr.number,
        });
        const unresolved = countUnresolvedCodeRabbitThreads(res);
        if (unresolved > 0) {
          items.push({
            dedupeKey: `decision:cr-threads:${pr.nodeId}:${unresolved}`,
            kind: "unresolved_threads",
            priority: PRIORITY.unresolved_threads,
            repo: pr.repo.nameWithOwner,
            title: `${unresolved} unresolved CodeRabbit thread${unresolved === 1 ? "" : "s"} on PR #${pr.number}: ${pr.title}`,
            detail: null,
            externalUrl: pr.url,
            occurredAt: pr.ghUpdatedAt ?? pr.syncedAt,
          });
        }
      }
    } catch (error) {
      console.warn("decision queue: review-thread check failed for an installation", briefError(error));
    }
  }

  const findings = await prisma.auditFinding.findMany({
    where: { state: "open", autoFixable: true },
    include: { audit: { include: { repo: true } } },
    orderBy: { createdAt: "desc" },
    take: 25,
  });
  for (const finding of findings) {
    items.push({
      dedupeKey: `decision:finding:${finding.id}`,
      kind: "audit_finding",
      priority: PRIORITY.audit_finding,
      repo: finding.audit.repo.nameWithOwner,
      title: `Auto-fixable audit finding (${finding.severity}): ${finding.title}`,
      detail: finding.file,
      externalUrl: `/repos/${finding.audit.repoId}/audit`,
      occurredAt: finding.createdAt,
    });
  }

  const failedBatches = await prisma.auditBatch.findMany({
    where: { status: "failed" },
    orderBy: { createdAt: "desc" },
    take: 5,
  });
  for (const batch of failedBatches) {
    items.push({
      dedupeKey: `decision:batch:${batch.id}`,
      kind: "batch_failed",
      priority: PRIORITY.batch_failed,
      repo: null,
      title: `Fleet audit batch failed${batch.error ? `: ${batch.error}` : ""}`,
      detail: null,
      externalUrl: "/audits",
      occurredAt: batch.createdAt,
    });
  }

  const dismissals = await prisma.decisionDismissal.findMany({ select: { dedupeKey: true } });
  return prioritizeDecisions(items, new Set(dismissals.map((d) => d.dedupeKey)));
}
