import { describe, expect, it } from "vitest";
import { parseModulesYaml, renderModulesYaml } from "./modules-yaml";

describe("parseModulesYaml", () => {
  it("reads the modules list, trims and dedupes", () => {
    expect(parseModulesYaml("modules:\n  - auth\n  - billing\n  - auth\n")).toEqual([
      "auth",
      "billing",
    ]);
  });

  it("ignores comments and surrounding noise", () => {
    expect(parseModulesYaml("# managed by orchid\nmodules:\n  - picking\n")).toEqual(["picking"]);
  });

  it("returns [] for a missing key, empty list or invalid YAML", () => {
    expect(parseModulesYaml("other: value")).toEqual([]);
    expect(parseModulesYaml("modules: []")).toEqual([]);
    expect(parseModulesYaml("modules:\n  - [unclosed")).toEqual([]);
  });
});

describe("renderModulesYaml", () => {
  it("renders a modules block that round-trips through the parser", () => {
    const out = renderModulesYaml(["auth", "billing"]);
    expect(out).toContain("modules:");
    expect(parseModulesYaml(out)).toEqual(["auth", "billing"]);
  });

  it("renders (and parses back) an empty list", () => {
    expect(parseModulesYaml(renderModulesYaml([]))).toEqual([]);
  });
});
