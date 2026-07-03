import type { Org } from "@prisma/client";
import { prisma } from "@/server/db";
import { getApp, getInstallationOctokit } from "@/server/github/app";
import { type GraphqlPrNode, mapPrNode } from "@/server/github/pr-map";
import {
  type GraphqlProjectItemNode,
  type GraphqlProjectNode,
  PRIORITY_FIELD_NAME,
  STATUS_FIELD_NAME,
  mapProjectItemNode,
  mapProjectNode,
} from "@/server/github/projects-map";
import { reconcileAutomations } from "@/server/automations/reconcile";
import { syncHooks } from "@/server/github/hooks";
import { syncStandards } from "@/server/github/standards";
import { briefError } from "@/server/log";

const PR_SEARCH = `
  query($q: String!, $after: String) {
    search(query: $q, type: ISSUE, first: 50, after: $after) {
      nodes {
        ... on PullRequest {
          id number title url state isDraft
          author { login }
          baseRefName headRefName reviewDecision mergeable
          repository { nameWithOwner }
          labels(first: 20) { nodes { name } }
          commits(last: 1) { nodes { commit { statusCheckRollup { state } } } }
          updatedAt
        }
      }
      pageInfo { hasNextPage endCursor }
    }
  }`;

interface PrSearchResult {
  search: {
    nodes: Array<GraphqlPrNode | Record<string, never>>;
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
  };
}

const PROJECTS_QUERY = `
  query($login: String!, $after: String) {
    organization(login: $login) {
      projectsV2(first: 50, after: $after) {
        nodes {
          id number title url shortDescription closed updatedAt
          items { totalCount }
        }
        pageInfo { hasNextPage endCursor }
      }
    }
  }`;

interface ProjectsResult {
  organization: {
    projectsV2: {
      nodes: Array<GraphqlProjectNode | null>;
      pageInfo: { hasNextPage: boolean; endCursor: string | null };
    };
  } | null;
}

const PROJECT_ITEMS_QUERY = `
  query($projectId: ID!, $after: String) {
    node(id: $projectId) {
      ... on ProjectV2 {
        items(first: 100, after: $after) {
          nodes {
            id type
            status: fieldValueByName(name: "${STATUS_FIELD_NAME}") {
              ... on ProjectV2ItemFieldSingleSelectValue { name }
            }
            priority: fieldValueByName(name: "${PRIORITY_FIELD_NAME}") {
              ... on ProjectV2ItemFieldSingleSelectValue { name }
            }
            content {
              ... on Issue {
                number title url state updatedAt repository { nameWithOwner }
                assignees(first: 10) { nodes { login } }
                labels(first: 50) { nodes { name } }
              }
              ... on PullRequest {
                number title url state updatedAt repository { nameWithOwner }
                assignees(first: 10) { nodes { login } }
                labels(first: 50) { nodes { name } }
              }
              ... on DraftIssue {
                title updatedAt
                assignees(first: 10) { nodes { login } }
              }
            }
          }
          pageInfo { hasNextPage endCursor }
        }
      }
    }
  }`;

interface ProjectItemsResult {
  node: {
    items?: {
      nodes: Array<GraphqlProjectItemNode | null>;
      pageInfo: { hasNextPage: boolean; endCursor: string | null };
    };
  } | null;
}

/** Upsert every installation account (org/user the App is on) into the Org cache. */
export async function syncInstallations(): Promise<number> {
  const app = await getApp();
  const res = await app.octokit.request("GET /app/installations", { per_page: 100 });
  let count = 0;
  for (const inst of res.data) {
    const account = inst.account;
    if (!account || !("login" in account)) continue;
    const fields = {
      login: account.login,
      avatarUrl: account.avatar_url,
      installationId: inst.id,
    };
    await prisma.org.upsert({
      where: { githubId: account.id },
      create: { githubId: account.id, ...fields },
      update: fields,
    });
    count += 1;
  }
  return count;
}

/** Upsert the repositories an installation can access into the Repo cache. */
export async function syncRepos(org: Org): Promise<number> {
  if (!org.installationId) return 0;
  const octokit = await getInstallationOctokit(org.installationId);
  let count = 0;
  for (let page = 1; ; page += 1) {
    const res = await octokit.request("GET /installation/repositories", { per_page: 100, page });
    for (const r of res.data.repositories) {
      const fields = {
        orgId: org.id,
        name: r.name,
        nameWithOwner: r.full_name,
        defaultBranch: r.default_branch ?? "main",
        isArchived: r.archived,
        isPrivate: r.private,
        url: r.html_url,
        pushedAt: r.pushed_at ? new Date(r.pushed_at) : null,
      };
      await prisma.repo.upsert({
        where: { githubId: r.id },
        create: { githubId: r.id, ...fields },
        update: fields,
      });
      count += 1;
    }
    if (res.data.repositories.length < 100) break;
  }
  return count;
}

/** Refresh the open-PR cache for an org via the GraphQL search API. */
export async function syncPulls(org: Org): Promise<number> {
  if (!org.installationId) return 0;
  const octokit = await getInstallationOctokit(org.installationId);
  const q = `org:${org.login} is:pr is:open`;
  const seen: string[] = [];
  let after: string | null = null;

  do {
    let res: PrSearchResult;
    try {
      res = await octokit.graphql<PrSearchResult>(PR_SEARCH, { q, after });
    } catch (error) {
      // GitHub returns PARTIAL data plus a per-field error when a queried field needs a permission the
      // App installation lacks — here `statusCheckRollup` needs Checks + Commit-statuses read. Octokit
      // throws on the `errors` array even though usable data is attached, so use that partial data and
      // let the missing field degrade to null (checksState) instead of failing + retrying the sync.
      const partial = (error as { data?: PrSearchResult }).data;
      if (!partial?.search) throw error;
      console.warn(
        "syncPulls: partial PR data — grant the GitHub App 'Checks' + 'Commit statuses' (read) to populate PR check state.",
      );
      res = partial;
    }
    for (const raw of res.search.nodes) {
      if (!("id" in raw) || !raw.id) continue;
      const m = mapPrNode(raw as GraphqlPrNode);
      const repo = await prisma.repo.findUnique({ where: { nameWithOwner: m.nameWithOwner } });
      if (!repo) continue; // repo not cached yet — syncRepos runs first in syncAll
      const fields = {
        repoId: repo.id,
        number: m.number,
        title: m.title,
        url: m.url,
        state: m.state,
        isDraft: m.isDraft,
        authorLogin: m.authorLogin,
        baseRef: m.baseRef,
        headRef: m.headRef,
        reviewDecision: m.reviewDecision,
        checksState: m.checksState,
        mergeable: m.mergeable,
        labels: m.labels,
        ghUpdatedAt: m.ghUpdatedAt,
        syncedAt: new Date(),
      };
      await prisma.pullRequest.upsert({
        where: { nodeId: m.nodeId },
        create: { nodeId: m.nodeId, ...fields },
        update: fields,
      });
      seen.push(m.nodeId);
    }
    after = res.search.pageInfo.hasNextPage ? res.search.pageInfo.endCursor : null;
  } while (after);

  // Drop cached PRs for this org's repos that are no longer open.
  const repoIds = (
    await prisma.repo.findMany({ where: { orgId: org.id }, select: { id: true } })
  ).map((r) => r.id);
  if (repoIds.length > 0) {
    await prisma.pullRequest.deleteMany({
      where: { repoId: { in: repoIds }, nodeId: { notIn: seen.length > 0 ? seen : ["__none__"] } },
    });
  }
  return seen.length;
}

/** Refresh the ProjectsV2 cache for an org (list + item counts). Accounts without an
 *  `organization` node (e.g. user installs) have no org projects, so this is a no-op. */
export async function syncProjects(org: Org): Promise<number> {
  if (!org.installationId) return 0;
  const octokit = await getInstallationOctokit(org.installationId);
  const seen: string[] = [];
  let after: string | null = null;
  let fetched = false; // only prune once we actually received a projects connection

  do {
    const res: ProjectsResult = await octokit.graphql<ProjectsResult>(PROJECTS_QUERY, {
      login: org.login,
      after,
    });
    const conn = res.organization?.projectsV2;
    if (!conn) break;
    fetched = true;
    for (const node of conn.nodes) {
      if (!node?.id) continue;
      const m = mapProjectNode(node);
      const fields = {
        orgId: org.id,
        number: m.number,
        title: m.title,
        url: m.url,
        shortDescription: m.shortDescription,
        closed: m.closed,
        itemCount: m.itemCount,
        ghUpdatedAt: m.ghUpdatedAt,
        syncedAt: new Date(),
      };
      await prisma.project.upsert({
        where: { nodeId: m.nodeId },
        create: { nodeId: m.nodeId, ...fields },
        update: fields,
      });
      seen.push(m.nodeId);
    }
    after = conn.pageInfo.hasNextPage ? conn.pageInfo.endCursor : null;
  } while (after);

  // Only prune when we actually got a projects connection — a null `organization`
  // (transient error, permissions blip, or a non-org install) must NOT wipe the cache.
  if (fetched) {
    await prisma.project.deleteMany({
      where: { orgId: org.id, nodeId: { notIn: seen.length > 0 ? seen : ["__none__"] } },
    });
  }
  return seen.length;
}

/** Refresh the cached items (issues/PRs/drafts) + their Status column for every open project,
 *  for the per-project board. Paginates the items connection; best-effort per project (a transient
 *  error leaves that project's cached items intact). Returns the number of items written. */
export async function syncProjectItems(): Promise<number> {
  const projects = await prisma.project.findMany({ where: { closed: false }, include: { org: true } });
  let total = 0;
  for (const project of projects) {
    if (!project.org.installationId) continue;
    const octokit = await getInstallationOctokit(project.org.installationId);
    const seen: string[] = [];
    let after: string | null = null;
    let fetched = false;

    try {
      do {
        const res: ProjectItemsResult = await octokit.graphql<ProjectItemsResult>(
          PROJECT_ITEMS_QUERY,
          { projectId: project.nodeId, after },
        );
        const conn = res.node?.items;
        if (!conn) break;
        fetched = true;
        for (const node of conn.nodes) {
          if (!node?.id) continue;
          const m = mapProjectItemNode(node);
          const fields = {
            projectId: project.id,
            type: m.type,
            title: m.title,
            url: m.url,
            number: m.number,
            state: m.state,
            status: m.status,
            priority: m.priority,
            assignees: m.assignees,
            labels: m.labels,
            contentRepo: m.contentRepo,
            ghUpdatedAt: m.ghUpdatedAt,
            syncedAt: new Date(),
          };
          await prisma.projectItem.upsert({
            where: { nodeId: m.nodeId },
            create: { nodeId: m.nodeId, ...fields },
            update: fields,
          });
          seen.push(m.nodeId);
          total += 1;
        }
        after = conn.pageInfo.hasNextPage ? conn.pageInfo.endCursor : null;
      } while (after);
    } catch (error) {
      // Transient/permissions error — skip this project this run, keep its cached items.
      console.warn(`projects: failed to sync items for ${project.url}`, briefError(error));
      continue;
    }

    // Only prune once we actually received an items connection (never wipe on a transient error).
    if (fetched) {
      await prisma.projectItem.deleteMany({
        where: { projectId: project.id, nodeId: { notIn: seen.length > 0 ? seen : ["__none__"] } },
      });
    }
  }
  return total;
}

/** Full refresh: installations → repos → open PRs → projects per org, then reconcile the tracked
 *  automation installs, the per-project board items, and the agent-hook drift vs the template. */
export async function syncAll(): Promise<{
  orgs: number;
  repos: number;
  pulls: number;
  projects: number;
  projectItems: number;
  automations: number;
  hooks: number;
  standards: number;
}> {
  const orgs = await syncInstallations();
  const orgRows = await prisma.org.findMany();
  let repos = 0;
  let pulls = 0;
  let projects = 0;
  for (const org of orgRows) {
    repos += await syncRepos(org);
    pulls += await syncPulls(org);
    projects += await syncProjects(org);
  }
  const projectItems = await syncProjectItems();
  const automations = await reconcileAutomations();
  const hooks = await syncHooks();
  const standards = await syncStandards();
  return { orgs, repos, pulls, projects, projectItems, automations, hooks, standards };
}
