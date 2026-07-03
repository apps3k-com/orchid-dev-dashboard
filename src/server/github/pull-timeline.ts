/** Live PR-timeline fetch for the /pulls detail modal. The PullRequest cache stores only summary
 *  fields, so a PR's conversation (comments, reviews, commits, label/state events) is fetched live
 *  from GitHub's GraphQL `timelineItems` connection. Pure `mapTimelineNode` is unit-tested. */

// Minimal shape we need from an installation Octokit — keeps this module decoupled + testable.
export type GraphqlExecutor = {
  graphql: <T>(query: string, variables?: Record<string, unknown>) => Promise<T>;
};

/** One normalized entry in a PR's activity feed (discriminated by `kind`). */
export type PullTimelineEntry =
  | {
      kind: "comment";
      actor: string | null;
      avatarUrl: string | null;
      createdAt: string;
      body: string;
      url: string | null;
    }
  | {
      kind: "review";
      actor: string | null;
      avatarUrl: string | null;
      createdAt: string;
      state: string; // APPROVED | CHANGES_REQUESTED | COMMENTED | DISMISSED
      body: string;
      url: string | null;
    }
  | {
      kind: "commit";
      actor: string | null;
      avatarUrl: string | null;
      createdAt: string;
      messageHeadline: string;
      abbreviatedOid: string;
      url: string | null;
    }
  | {
      kind: "label";
      actor: string | null;
      createdAt: string;
      added: boolean;
      label: string;
      labelColor: string | null;
    }
  | {
      kind: "event";
      actor: string | null;
      createdAt: string;
      event: string; // opened | merged | closed | reopened | ready | draft | renamed | review_requested
      detail: string;
    };

/** PR header shown above the feed. */
export interface PullTimelineHeader {
  number: number;
  title: string;
  url: string;
  state: string; // OPEN | CLOSED | MERGED
  isDraft: boolean;
  authorLogin: string | null;
  authorAvatarUrl: string | null;
  bodyText: string;
  createdAt: string;
}

export interface PullTimeline {
  header: PullTimelineHeader;
  entries: PullTimelineEntry[];
  hasMore: boolean;
}

interface RawActor {
  login?: string | null;
  avatarUrl?: string | null;
}

/** A GraphQL timeline node — every field is optional; `mapTimelineNode` narrows on `__typename`. */
export interface RawTimelineNode {
  __typename: string;
  author?: RawActor | null;
  actor?: RawActor | null;
  createdAt?: string | null;
  bodyText?: string | null;
  url?: string | null;
  state?: string | null;
  label?: { name: string; color?: string | null } | null;
  currentTitle?: string | null;
  requestedReviewer?: { login?: string | null; name?: string | null } | null;
  commit?: {
    abbreviatedOid?: string;
    messageHeadline?: string;
    committedDate?: string;
    url?: string | null;
    author?: { user?: RawActor | null; name?: string | null } | null;
  } | null;
}

/** Map one raw GraphQL timeline node to a normalized entry. Returns null for unknown node types
 *  (so a future/unhandled `__typename` is skipped rather than rendered blank). Pure — unit-tested. */
export function mapTimelineNode(node: RawTimelineNode): PullTimelineEntry | null {
  switch (node.__typename) {
    case "IssueComment":
      return {
        kind: "comment",
        actor: node.author?.login ?? null,
        avatarUrl: node.author?.avatarUrl ?? null,
        createdAt: node.createdAt ?? "",
        body: node.bodyText ?? "",
        url: node.url ?? null,
      };
    case "PullRequestReview":
      // Keep bodyless reviews (e.g. a bare approval) — the `state` is the signal.
      return {
        kind: "review",
        actor: node.author?.login ?? null,
        avatarUrl: node.author?.avatarUrl ?? null,
        createdAt: node.createdAt ?? "",
        state: node.state ?? "COMMENTED",
        body: node.bodyText ?? "",
        url: node.url ?? null,
      };
    case "PullRequestCommit": {
      const c = node.commit;
      if (!c) return null;
      return {
        kind: "commit",
        actor: c.author?.user?.login ?? c.author?.name ?? null,
        avatarUrl: c.author?.user?.avatarUrl ?? null,
        createdAt: c.committedDate ?? "",
        messageHeadline: c.messageHeadline ?? "",
        abbreviatedOid: c.abbreviatedOid ?? "",
        url: c.url ?? null,
      };
    }
    case "LabeledEvent":
    case "UnlabeledEvent":
      return {
        kind: "label",
        actor: node.actor?.login ?? null,
        createdAt: node.createdAt ?? "",
        added: node.__typename === "LabeledEvent",
        label: node.label?.name ?? "",
        labelColor: node.label?.color ?? null,
      };
    case "RenamedTitleEvent":
      return {
        kind: "event",
        actor: node.actor?.login ?? null,
        createdAt: node.createdAt ?? "",
        event: "renamed",
        detail: node.currentTitle ? `renamed this to “${node.currentTitle}”` : "renamed this",
      };
    case "ReviewRequestedEvent": {
      const reviewer = node.requestedReviewer?.login ?? node.requestedReviewer?.name ?? null;
      return {
        kind: "event",
        actor: node.actor?.login ?? null,
        createdAt: node.createdAt ?? "",
        event: "review_requested",
        detail: reviewer ? `requested a review from ${reviewer}` : "requested a review",
      };
    }
    case "MergedEvent":
      return event(node, "merged", "merged this pull request");
    case "ClosedEvent":
      return event(node, "closed", "closed this pull request");
    case "ReopenedEvent":
      return event(node, "reopened", "reopened this pull request");
    case "ReadyForReviewEvent":
      return event(node, "ready", "marked this ready for review");
    case "ConvertToDraftEvent":
      return event(node, "draft", "converted this to draft");
    default:
      return null;
  }
}

function event(node: RawTimelineNode, name: string, detail: string): PullTimelineEntry {
  return {
    kind: "event",
    actor: node.actor?.login ?? null,
    createdAt: node.createdAt ?? "",
    event: name,
    detail,
  };
}

const PULL_TIMELINE_QUERY = `
  query($owner: String!, $name: String!, $number: Int!) {
    repository(owner: $owner, name: $name) {
      pullRequest(number: $number) {
        number title url state isDraft bodyText createdAt
        author { login avatarUrl }
        timelineItems(
          first: 50
          itemTypes: [
            ISSUE_COMMENT, PULL_REQUEST_REVIEW, PULL_REQUEST_COMMIT,
            LABELED_EVENT, UNLABELED_EVENT, REVIEW_REQUESTED_EVENT, RENAMED_TITLE_EVENT,
            MERGED_EVENT, CLOSED_EVENT, REOPENED_EVENT, READY_FOR_REVIEW_EVENT, CONVERT_TO_DRAFT_EVENT
          ]
        ) {
          totalCount
          pageInfo { hasNextPage }
          nodes {
            __typename
            ... on IssueComment { author { login avatarUrl } createdAt bodyText url }
            ... on PullRequestReview { author { login avatarUrl } createdAt state bodyText url }
            ... on PullRequestCommit {
              commit {
                abbreviatedOid messageHeadline committedDate url
                author { name user { login avatarUrl } }
              }
            }
            ... on LabeledEvent { actor { login } createdAt label { name color } }
            ... on UnlabeledEvent { actor { login } createdAt label { name color } }
            ... on ReviewRequestedEvent {
              actor { login } createdAt
              requestedReviewer { __typename ... on User { login } ... on Team { name } }
            }
            ... on RenamedTitleEvent { actor { login } createdAt currentTitle }
            ... on MergedEvent { actor { login } createdAt }
            ... on ClosedEvent { actor { login } createdAt }
            ... on ReopenedEvent { actor { login } createdAt }
            ... on ReadyForReviewEvent { actor { login } createdAt }
            ... on ConvertToDraftEvent { actor { login } createdAt }
          }
        }
      }
    }
  }`;

interface PullTimelineResult {
  repository: {
    pullRequest: {
      number: number;
      title: string;
      url: string;
      state: string;
      isDraft: boolean;
      bodyText: string | null;
      createdAt: string;
      author: RawActor | null;
      timelineItems: {
        totalCount: number;
        pageInfo: { hasNextPage: boolean };
        nodes: Array<RawTimelineNode | null>;
      };
    } | null;
  } | null;
}

/** Fetch a PR's live timeline. Returns null when the PR can't be found. Resilient to GitHub's
 *  partial-data pattern (HTTP 200 with an `errors[]` array when a nested field needs a missing
 *  permission): octokit throws but attaches the usable data, which we fall back to. */
export async function fetchPullTimeline(args: {
  octokit: GraphqlExecutor;
  owner: string;
  name: string;
  number: number;
}): Promise<PullTimeline | null> {
  const { octokit, owner, name, number } = args;
  let data: PullTimelineResult;
  try {
    data = await octokit.graphql<PullTimelineResult>(PULL_TIMELINE_QUERY, { owner, name, number });
  } catch (error) {
    const partial = (error as { data?: PullTimelineResult }).data;
    if (!partial?.repository?.pullRequest) throw error;
    data = partial;
  }

  const pr = data.repository?.pullRequest;
  if (!pr) return null;

  const entries = pr.timelineItems.nodes
    .filter((n): n is RawTimelineNode => Boolean(n))
    .map(mapTimelineNode)
    .filter((e): e is PullTimelineEntry => e !== null);

  return {
    header: {
      number: pr.number,
      title: pr.title,
      url: pr.url,
      state: pr.state,
      isDraft: pr.isDraft,
      authorLogin: pr.author?.login ?? null,
      authorAvatarUrl: pr.author?.avatarUrl ?? null,
      bodyText: pr.bodyText ?? "",
      createdAt: pr.createdAt,
    },
    entries,
    hasMore: pr.timelineItems.pageInfo.hasNextPage,
  };
}
