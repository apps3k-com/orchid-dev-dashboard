import { afterEach, describe, expect, it } from "vitest";
import { isLlmAdmin, parseLlmAdmins } from "./admin";

describe("parseLlmAdmins", () => {
  it("splits, trims, lowercases, and drops blanks", () => {
    const admins = parseLlmAdmins("  Bvk , octocat ,, OCTODEX ");
    expect([...admins].sort()).toEqual(["bvk", "octocat", "octodex"]);
  });

  it("returns an empty set for undefined/empty input", () => {
    expect(parseLlmAdmins(undefined).size).toBe(0);
    expect(parseLlmAdmins("   ").size).toBe(0);
  });
});

describe("isLlmAdmin", () => {
  const original = process.env.ORCHID_LLM_ADMINS;
  afterEach(() => {
    if (original === undefined) delete process.env.ORCHID_LLM_ADMINS;
    else process.env.ORCHID_LLM_ADMINS = original;
  });

  it("matches case-insensitively against the allowlist", () => {
    process.env.ORCHID_LLM_ADMINS = "bvk,octocat";
    expect(isLlmAdmin("BVK")).toBe(true);
    expect(isLlmAdmin("octocat")).toBe(true);
    expect(isLlmAdmin("stranger")).toBe(false);
  });

  it("denies everyone when the allowlist is unset (locked down by default)", () => {
    delete process.env.ORCHID_LLM_ADMINS;
    expect(isLlmAdmin("bvk")).toBe(false);
  });
});
