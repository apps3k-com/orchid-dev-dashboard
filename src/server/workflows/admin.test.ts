import { describe, expect, it } from "vitest";
import { isWorkflowAdmin, parseWorkflowAdmins } from "./admin";

describe("workflow administrator allowlist", () => {
  it("normalizes configured GitHub logins", () => {
    expect([...parseWorkflowAdmins(" Apps3000, octocat ,")]).toEqual(["apps3000", "octocat"]);
  });

  it("fails closed while the allowlist is absent", () => {
    const original = process.env.ORCHID_WORKFLOW_ADMINS;
    delete process.env.ORCHID_WORKFLOW_ADMINS;
    expect(isWorkflowAdmin("apps3000")).toBe(false);
    if (original === undefined) delete process.env.ORCHID_WORKFLOW_ADMINS;
    else process.env.ORCHID_WORKFLOW_ADMINS = original;
  });
});
