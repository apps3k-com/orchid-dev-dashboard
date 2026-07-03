import { describe, expect, it } from "vitest";
import { TIER0_STANDARDS, classifyStandards, computeTier, tier0Gaps } from "./standards";

const paths = (...p: string[]) => new Set(p);

const ALL_TIER0 = [
  ".github/workflows/security-scan.yml",
  ".github/dependabot.yml",
  ".github/CODEOWNERS",
  "LICENSE",
  "SECURITY.md",
  "CONTRIBUTING.md",
  ".github/workflows/commitlint.yml",
  "commitlint.config.mjs",
  ".env.tmpl",
  "scripts/github/provision-ruleset.mjs",
];

const byKey = (set: Set<string>) =>
  Object.fromEntries(classifyStandards(set).map((s) => [s.key, s.status]));

describe("classifyStandards", () => {
  it("marks every Tier-0 standard present for a fully compliant repo", () => {
    const states = classifyStandards(paths(...ALL_TIER0));
    expect(states).toHaveLength(TIER0_STANDARDS.length);
    expect(states.every((s) => s.status === "present")).toBe(true);
  });

  it("marks all standards missing for an empty repo", () => {
    expect(classifyStandards(paths()).every((s) => s.status === "missing")).toBe(true);
  });

  it("accepts alternative locations (root CODEOWNERS, LICENSE.md, .github/SECURITY.md)", () => {
    const k = byKey(paths("CODEOWNERS", "LICENSE.md", ".github/SECURITY.md"));
    expect(k["codeowners"]).toBe("present");
    expect(k["license"]).toBe("present");
    expect(k["security-policy"]).toBe("present");
  });

  it("requires BOTH the commitlint workflow and a config file", () => {
    expect(byKey(paths(".github/workflows/commitlint.yml"))["commitlint"]).toBe("missing");
    expect(byKey(paths("commitlint.config.mjs"))["commitlint"]).toBe("missing");
    expect(
      byKey(paths(".github/workflows/commitlint.yml", "commitlint.config.mjs"))["commitlint"],
    ).toBe("present");
  });
});

describe("computeTier / tier0Gaps", () => {
  it("returns tier 0 with no gaps when the whole baseline is present", () => {
    const states = classifyStandards(paths(...ALL_TIER0));
    expect(computeTier(states)).toBe(0);
    expect(tier0Gaps(states)).toEqual([]);
  });

  it("returns null and lists the gaps when the baseline is incomplete", () => {
    const states = classifyStandards(paths(...ALL_TIER0.filter((p) => p !== ".env.tmpl")));
    expect(computeTier(states)).toBeNull();
    expect(tier0Gaps(states)).toContain("secrets-model");
  });

  it("returns null for an empty state list", () => {
    expect(computeTier([])).toBeNull();
  });

  it("returns null on partial data even when every present row passes (stale rows)", () => {
    const partial = classifyStandards(paths(...ALL_TIER0)).filter((s) => s.key !== "dependabot");
    expect(partial.every((s) => s.status === "present")).toBe(true);
    expect(computeTier(partial)).toBeNull();
  });
});
