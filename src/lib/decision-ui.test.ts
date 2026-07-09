import { describe, expect, it } from "vitest";
import { decisionKindStyle, isInternalUrl, relativeAge } from "./decision-ui";

describe("decisionKindStyle", () => {
  it("tints failing checks and failed batches as destructive", () => {
    expect(decisionKindStyle("failing_checks").badge).toBe("destructive");
    expect(decisionKindStyle("batch_failed").badge).toBe("destructive");
  });

  it("gives each known kind a non-empty label", () => {
    for (const kind of [
      "failing_checks",
      "agent_waiting",
      "unresolved_threads",
      "ready_to_merge",
      "audit_finding",
      "batch_failed",
    ] as const) {
      expect(decisionKindStyle(kind).label.length).toBeGreaterThan(0);
    }
  });
});

describe("isInternalUrl", () => {
  it("treats leading-slash routes as internal and full URLs as external", () => {
    expect(isInternalUrl("/audits")).toBe(true);
    expect(isInternalUrl("/repos/abc/audit")).toBe(true);
    expect(isInternalUrl("https://github.com/x/y/pull/1")).toBe(false);
    expect(isInternalUrl(null)).toBe(false);
  });
});

describe("relativeAge", () => {
  const base = new Date("2026-07-09T12:00:00Z");
  it("buckets seconds/minutes/hours/days", () => {
    expect(relativeAge(new Date("2026-07-09T11:59:30Z"), base)).toBe("just now");
    expect(relativeAge(new Date("2026-07-09T11:45:00Z"), base)).toBe("15m");
    expect(relativeAge(new Date("2026-07-09T09:00:00Z"), base)).toBe("3h");
    expect(relativeAge(new Date("2026-07-06T12:00:00Z"), base)).toBe("3d");
  });

  it("never goes negative for a future timestamp", () => {
    expect(relativeAge(new Date("2026-07-09T12:05:00Z"), base)).toBe("just now");
  });
});
