import { describe, expect, it } from "vitest";
import { type AuditFindingResult, validateFindings } from "./audit-schema";
import { estimateUsd } from "./audit";

const finding = (over: Partial<AuditFindingResult>): AuditFindingResult => ({
  title: "t",
  severity: "high",
  category: "security",
  file: ".claude/settings.json",
  lineHint: null,
  evidence: null,
  rationale: "r",
  recommendation: "rec",
  autoFixable: false,
  proposedPatch: null,
  ...over,
});

describe("estimateUsd", () => {
  it("prices input + output tokens from the per-model rates", () => {
    // sonnet: $3/M in, $15/M out → 1M in + 0.1M out = 3 + 1.5 = 4.5
    expect(estimateUsd("claude-sonnet-4-6", 1_000_000, 100_000)).toBeCloseTo(4.5, 5);
  });

  it("returns 0 for an unknown model", () => {
    expect(estimateUsd("nope", 1_000_000, 1_000_000)).toBe(0);
  });
});

describe("validateFindings", () => {
  const audited = new Set([".claude/settings.json", ".codex/hooks.json"]);

  it("keeps findings that cite an audited file with valid severity + category", () => {
    const kept = validateFindings([finding({})], audited);
    expect(kept).toHaveLength(1);
  });

  it("drops findings citing a file that was not audited (hallucinated path)", () => {
    const kept = validateFindings([finding({ file: "src/made-up.ts" })], audited);
    expect(kept).toHaveLength(0);
  });

  it("drops findings with an unknown severity or category", () => {
    const kept = validateFindings(
      [
        finding({ severity: "extreme" as AuditFindingResult["severity"] }),
        finding({ category: "vibes" as AuditFindingResult["category"] }),
      ],
      audited,
    );
    expect(kept).toHaveLength(0);
  });
});
