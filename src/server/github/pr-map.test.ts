import { describe, expect, it } from "vitest";
import { type GraphqlPrNode, mapPrNode } from "./pr-map";

const node: GraphqlPrNode = {
  id: "PR_node_1",
  number: 42,
  title: "feat: thing",
  url: "https://github.com/o/r/pull/42",
  state: "OPEN",
  isDraft: false,
  author: { login: "alice" },
  baseRefName: "main",
  headRefName: "feature/thing",
  reviewDecision: "CHANGES_REQUESTED",
  mergeable: "MERGEABLE",
  repository: { nameWithOwner: "o/r" },
  labels: { nodes: [{ name: "bug" }, { name: "module:auth" }] },
  commits: { nodes: [{ commit: { statusCheckRollup: { state: "FAILURE" } } }] },
  updatedAt: "2026-06-25T10:00:00Z",
};

describe("mapPrNode", () => {
  it("maps the core fields", () => {
    const m = mapPrNode(node);
    expect(m.nodeId).toBe("PR_node_1");
    expect(m.nameWithOwner).toBe("o/r");
    expect(m.authorLogin).toBe("alice");
    expect(m.checksState).toBe("FAILURE");
    expect(m.labels).toEqual(["bug", "module:auth"]);
    expect(m.ghUpdatedAt).toBeInstanceOf(Date);
  });

  it("tolerates a null author and missing check rollup", () => {
    const m = mapPrNode({
      ...node,
      author: null,
      commits: { nodes: [{ commit: { statusCheckRollup: null } }] },
    });
    expect(m.authorLogin).toBeNull();
    expect(m.checksState).toBeNull();
  });

  it("tolerates no commits", () => {
    expect(mapPrNode({ ...node, commits: { nodes: [] } }).checksState).toBeNull();
  });
});
