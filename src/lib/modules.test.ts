import { describe, expect, it } from "vitest";

import { buildModuleRows } from "./modules";

describe("buildModuleRows", () => {
  it("joins names with metadata + counts issues by the module:<name> label", () => {
    const rows = buildModuleRows(
      ["auth", "billing"],
      [{ name: "auth", description: "Login + sessions", status: "active" }],
      [["module:auth", "bug"], ["module:auth"], ["module:billing"], ["priority:high"]],
    );
    expect(rows).toEqual([
      { name: "auth", description: "Login + sessions", status: "active", assignedIssues: 2 },
      { name: "billing", description: "", status: "active", assignedIssues: 1 },
    ]);
  });

  it("defaults description/status for names without metadata and counts 0 with no labels", () => {
    expect(buildModuleRows(["picking"], [], [])).toEqual([
      { name: "picking", description: "", status: "active", assignedIssues: 0 },
    ]);
  });

  it("keeps the yaml names as the canonical set (ignores metadata for a name no longer listed)", () => {
    const rows = buildModuleRows(
      ["auth"],
      [
        { name: "auth", description: "A", status: "deprecated" },
        { name: "ghost", description: "orphan", status: "active" },
      ],
      [],
    );
    expect(rows.map((r) => r.name)).toEqual(["auth"]);
    expect(rows[0].status).toBe("deprecated");
  });
});
