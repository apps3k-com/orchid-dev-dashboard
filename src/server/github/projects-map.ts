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

/** The single-select project field whose option names the board columns. GitHub's default. */
export const STATUS_FIELD_NAME = "Status";

/** A single-select field value on a project item (only this union member carries an option name). */
interface SingleSelectFieldValue {
  name: string | null;
  field: { name: string } | null;
}

/** A ProjectV2 item node (issue/PR/draft) as returned by the project-items query. */
export interface GraphqlProjectItemNode {
  id: string;
  type: string; // ISSUE | PULL_REQUEST | DRAFT_ISSUE | REDACTED
  fieldValues: { nodes: Array<Partial<SingleSelectFieldValue> | Record<string, never>> };
  content: {
    number?: number;
    title?: string;
    url?: string;
    state?: string;
    updatedAt?: string | null;
    repository?: { nameWithOwner: string };
  } | null;
}

/** Flat ProjectItem cache record (matches the Prisma ProjectItem columns we set). */
export interface ProjectItemRecord {
  nodeId: string;
  type: string;
  title: string;
  url: string | null;
  number: number | null;
  state: string | null;
  status: string | null;
  contentRepo: string | null;
  ghUpdatedAt: Date | null;
}

/** Map a ProjectV2 item node to a flat cache record, lifting its Status option out of the field
 *  values (pure — unit-tested). Items without a Status value get `status: null` (= "No Status"). */
export function mapProjectItemNode(node: GraphqlProjectItemNode): ProjectItemRecord {
  const status =
    node.fieldValues.nodes.find(
      (value): value is SingleSelectFieldValue =>
        "field" in value && value.field?.name === STATUS_FIELD_NAME,
    )?.name ?? null;
  const content = node.content;
  return {
    nodeId: node.id,
    type: node.type,
    title: content?.title ?? "(untitled)",
    url: content?.url ?? null,
    number: content?.number ?? null,
    state: content?.state ?? null,
    status,
    contentRepo: content?.repository?.nameWithOwner ?? null,
    ghUpdatedAt: content?.updatedAt ? new Date(content.updatedAt) : null,
  };
}
