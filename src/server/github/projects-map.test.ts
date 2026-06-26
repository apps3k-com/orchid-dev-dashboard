import { describe, expect, it } from "vitest";
import { type GraphqlProjectNode, mapProjectNode } from "./projects-map";

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
