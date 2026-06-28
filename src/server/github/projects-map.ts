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

/** The single-select project fields lifted onto each board item. GitHub's `Status` is the default
 *  column field; `Priority` is shown as a badge when the project defines it. */
export const STATUS_FIELD_NAME = "Status";
export const PRIORITY_FIELD_NAME = "Priority";

/** A single-select field value (only this union member carries an option `name`). */
type SingleSelectValue = { name: string | null } | null;

/** A ProjectV2 item node (issue/PR/draft) as returned by the project-items query. Status and
 *  Priority single-select values are fetched directly by name (aliased `status`/`priority`) — no
 *  `fieldValues` pagination, so they can never be truncated on items with many populated fields. */
export interface GraphqlProjectItemNode {
  id: string;
  type: string; // ISSUE | PULL_REQUEST | DRAFT_ISSUE | REDACTED
  status: SingleSelectValue;
  priority: SingleSelectValue;
  content: {
    number?: number;
    title?: string;
    url?: string;
    state?: string;
    updatedAt?: string | null;
    repository?: { nameWithOwner: string };
    assignees?: { nodes: Array<{ login: string }> };
    labels?: { nodes: Array<{ name: string }> };
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
  priority: string | null;
  assignees: string[];
  labels: string[];
  contentRepo: string | null;
  ghUpdatedAt: Date | null;
}

/** Map a ProjectV2 item node to a flat cache record, lifting its Status/Priority options (fetched
 *  by name) plus assignees and labels — pure, unit-tested. Items without a Status value get
 *  `status: null` (= "No Status"). */
export function mapProjectItemNode(node: GraphqlProjectItemNode): ProjectItemRecord {
  const content = node.content;
  return {
    nodeId: node.id,
    type: node.type,
    title: content?.title ?? "(untitled)",
    url: content?.url ?? null,
    number: content?.number ?? null,
    state: content?.state ?? null,
    status: node.status?.name ?? null,
    priority: node.priority?.name ?? null,
    assignees: content?.assignees?.nodes.map((a) => a.login) ?? [],
    labels: content?.labels?.nodes.map((l) => l.name) ?? [],
    contentRepo: content?.repository?.nameWithOwner ?? null,
    ghUpdatedAt: content?.updatedAt ? new Date(content.updatedAt) : null,
  };
}
