import { describe, expect, it } from "vitest";
import {
  type GraphqlProjectItemNode,
  type GraphqlProjectNode,
  mapProjectItemNode,
  mapProjectNode,
} from "./projects-map";

const node: GraphqlProjectNode = {
  id: "PVT_node_1",
  number: 16,
  title: "Orchid - The Developer Dashboard",
  url: "https://github.com/orgs/apps3k-com/projects/16",
  shortDescription: "Mission control",
  closed: false,
  updatedAt: "2026-06-26T10:00:00Z",
  items: { totalCount: 23 },
};

describe("mapProjectNode", () => {
  it("maps the core fields", () => {
    const m = mapProjectNode(node);
    expect(m.nodeId).toBe("PVT_node_1");
    expect(m.number).toBe(16);
    expect(m.itemCount).toBe(23);
    expect(m.closed).toBe(false);
    expect(m.ghUpdatedAt).toBeInstanceOf(Date);
  });

  it("tolerates a null description and updatedAt", () => {
    const m = mapProjectNode({ ...node, shortDescription: null, updatedAt: null });
    expect(m.shortDescription).toBeNull();
    expect(m.ghUpdatedAt).toBeNull();
  });
});

const issueItem: GraphqlProjectItemNode = {
  id: "PVTI_item_1",
  type: "ISSUE",
  fieldValueByName: { name: "In Progress" }, // Status resolved server-side by fieldValueByName
  content: {
    number: 42,
    title: "Wire the board",
    url: "https://github.com/apps3k-com/orchid-dev-dashboard/issues/42",
    state: "OPEN",
    updatedAt: "2026-06-27T09:00:00Z",
    repository: { nameWithOwner: "apps3k-com/orchid-dev-dashboard" },
  },
};

describe("mapProjectItemNode", () => {
  it("lifts the Status option and content fields", () => {
    const m = mapProjectItemNode(issueItem);
    expect(m.nodeId).toBe("PVTI_item_1");
    expect(m.type).toBe("ISSUE");
    expect(m.status).toBe("In Progress");
    expect(m.number).toBe(42);
    expect(m.state).toBe("OPEN");
    expect(m.contentRepo).toBe("apps3k-com/orchid-dev-dashboard");
    expect(m.ghUpdatedAt).toBeInstanceOf(Date);
  });

  it("defaults status to null when the item has no Status value", () => {
    const m = mapProjectItemNode({ ...issueItem, fieldValueByName: null });
    expect(m.status).toBeNull();
  });

  it("handles a draft item with no content url/number/repo", () => {
    const m = mapProjectItemNode({
      id: "PVTI_draft",
      type: "DRAFT_ISSUE",
      fieldValueByName: { name: "Todo" },
      content: { title: "Spike: nested pagination", updatedAt: null },
    });
    expect(m.title).toBe("Spike: nested pagination");
    expect(m.url).toBeNull();
    expect(m.number).toBeNull();
    expect(m.contentRepo).toBeNull();
    expect(m.status).toBe("Todo");
    expect(m.ghUpdatedAt).toBeNull();
  });

  it("falls back to a placeholder title when content is null", () => {
    const m = mapProjectItemNode({
      id: "PVTI_x",
      type: "REDACTED",
      fieldValueByName: null,
      content: null,
    });
    expect(m.title).toBe("(untitled)");
    expect(m.status).toBeNull();
  });
});
