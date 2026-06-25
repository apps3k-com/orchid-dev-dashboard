/** The PullRequest fields Orchid reads from the GraphQL `search` result. */
export interface GraphqlPrNode {
  id: string;
  number: number;
  title: string;
  url: string;
  state: string;
  isDraft: boolean;
  author: { login: string } | null;
  baseRefName: string;
  headRefName: string | null;
  reviewDecision: string | null;
  mergeable: string | null;
  repository: { nameWithOwner: string };
  labels: { nodes: Array<{ name: string }> };
  commits: { nodes: Array<{ commit: { statusCheckRollup: { state: string } | null } }> };
  updatedAt: string;
}

/** A normalized PR ready to upsert into the cache (repo resolved separately by nameWithOwner). */
export interface MappedPr {
  nodeId: string;
  nameWithOwner: string;
  number: number;
  title: string;
  url: string;
  state: string;
  isDraft: boolean;
  authorLogin: string | null;
  baseRef: string;
  headRef: string | null;
  reviewDecision: string | null;
  checksState: string | null;
  mergeable: string | null;
  labels: string[];
  ghUpdatedAt: Date;
}

/** Map a GraphQL PR node to the cache record shape. Pure — unit-tested. */
export function mapPrNode(node: GraphqlPrNode): MappedPr {
  return {
    nodeId: node.id,
    nameWithOwner: node.repository.nameWithOwner,
    number: node.number,
    title: node.title,
    url: node.url,
    state: node.state,
    isDraft: node.isDraft,
    authorLogin: node.author?.login ?? null,
    baseRef: node.baseRefName,
    headRef: node.headRefName,
    reviewDecision: node.reviewDecision,
    checksState: node.commits.nodes[0]?.commit.statusCheckRollup?.state ?? null,
    mergeable: node.mergeable,
    labels: node.labels.nodes.map((l) => l.name),
    ghUpdatedAt: new Date(node.updatedAt),
  };
}
