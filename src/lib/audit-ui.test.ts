import { describe, expect, it } from "vitest";
import { progressPct, severityVariant, statusVariant } from "./audit-ui";

describe("severityVariant", () => {
  it("maps known severities", () => {
    expect(severityVariant("critical")).toBe("destructive");
    expect(severityVariant("medium")).toBe("secondary");
    expect(severityVariant("low")).toBe("outline");
  });
  it("falls back to outline for unknown", () => {
    expect(severityVariant("nope")).toBe("outline");
  });
});

describe("statusVariant", () => {
  it("maps known statuses and falls back to outline", () => {
    expect(statusVariant("completed")).toBe("secondary");
    expect(statusVariant("failed")).toBe("destructive");
    expect(statusVariant("weird")).toBe("outline");
  });
});

describe("progressPct", () => {
  it("guards an empty batch (0 total) as 0%", () => {
    expect(progressPct({ total: 0, completed: 0, failed: 0 })).toBe(0);
  });
  it("counts completed + failed as terminal progress, rounded", () => {
    expect(progressPct({ total: 3, completed: 1, failed: 0 })).toBe(33); // 1/3 → 33
    expect(progressPct({ total: 8, completed: 3, failed: 0 })).toBe(38); // 3/8 → 37.5 → 38
    expect(progressPct({ total: 4, completed: 0, failed: 4 })).toBe(100); // all-failed = terminal
  });
  it("is 100% when every audit is terminal", () => {
    expect(progressPct({ total: 5, completed: 3, failed: 2 })).toBe(100);
  });
});
