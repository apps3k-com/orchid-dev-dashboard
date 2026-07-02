import { describe, expect, it } from "vitest";
import { severityVariant, statusVariant } from "./audit-ui";

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
