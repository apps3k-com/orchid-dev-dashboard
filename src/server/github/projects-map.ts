/** A GitHub ProjectV2 node as returned by the GraphQL projects query. */
export interface GraphqlProjectNode {
  id: string;
  number: number;
  title: string;
  url: string;
  shortDescription: string | null;
  closed: boolean;
  updatedAt: string | null;
  items: { totalCount: number };
}

/** Flat Project cache record (matches the Prisma Project columns we set). */
export interface ProjectRecord {
  nodeId: string;
  number: number;
  title: string;
  url: string;
  shortDescription: string | null;
  closed: boolean;
  itemCount: number;
  ghUpdatedAt: Date | null;
}

/** Map a GitHub ProjectV2 GraphQL node to a flat cache record (pure — unit-tested). */
export function mapProjectNode(node: GraphqlProjectNode): ProjectRecord {
  return {
    nodeId: node.id,
    number: node.number,
    title: node.title,
    url: node.url,
    shortDescription: node.shortDescription,
    closed: node.closed,
    itemCount: node.items.totalCount,
    ghUpdatedAt: node.updatedAt ? new Date(node.updatedAt) : null,
  };
}
