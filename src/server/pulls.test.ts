import { describe, expect, it } from "vitest";
import { prBucket } from "./pulls";

describe("prBucket", () => {
  it("classifies a draft regardless of other state", () => {
    expect(prBucket({ isDraft: true, reviewDecision: "CHANGES_REQUESTED", checksState: "FAILURE" })).toBe(
      "draft",
    );
  });

  it("prioritises changes-requested over failing checks", () => {
    expect(prBucket({ isDraft: false, reviewDecision: "CHANGES_REQUESTED", checksState: "FAILURE" })).toBe(
      "changes_requested",
    );
  });

  it("flags failing checks", () => {
    expect(prBucket({ isDraft: false, reviewDecision: null, checksState: "FAILURE" })).toBe(
      "checks_failing",
    );
    expect(prBucket({ isDraft: false, reviewDecision: null, checksState: "ERROR" })).toBe(
      "checks_failing",
    );
  });

  it("marks approved", () => {
    expect(prBucket({ isDraft: false, reviewDecision: "APPROVED", checksState: "SUCCESS" })).toBe(
      "approved",
    );
  });

  it("treats no/awaiting review as ready", () => {
    expect(prBucket({ isDraft: false, reviewDecision: null, checksState: "SUCCESS" })).toBe("ready");
    expect(prBucket({ isDraft: false, reviewDecision: "REVIEW_REQUIRED", checksState: null })).toBe(
      "ready",
    );
  });
});
