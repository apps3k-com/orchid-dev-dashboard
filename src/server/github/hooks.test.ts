import { describe, expect, it } from "vitest";
import { classifyHooks, isAcknowledged } from "./hooks";

const m = (entries: Record<string, string>) => new Map(Object.entries(entries));

describe("classifyHooks", () => {
  it("classifies match / outdated / missing / extra by blob SHA", () => {
    const template = m({
      ".claude/settings.json": "aaa",
      ".codex/hooks.json": "bbb",
      ".claude/hooks/guard.sh": "ccc",
    });
    const repo = m({
      ".claude/settings.json": "aaa", // identical -> match
      ".codex/hooks.json": "zzz", // differs -> outdated
      // .claude/hooks/guard.sh absent -> missing
      ".claude/hooks/extra.sh": "ddd", // repo-only -> extra
    });

    const byPath = Object.fromEntries(classifyHooks(template, repo).map((s) => [s.path, s]));

    expect(byPath[".claude/settings.json"].status).toBe("match");
    expect(byPath[".codex/hooks.json"].status).toBe("outdated");
    expect(byPath[".claude/hooks/guard.sh"].status).toBe("missing");
    expect(byPath[".claude/hooks/extra.sh"].status).toBe("extra");
  });

  it("carries both SHAs and returns paths sorted, deduped across the union", () => {
    const result = classifyHooks(m({ ".claude/b": "1", ".claude/a": "2" }), m({ ".claude/a": "9" }));

    expect(result.map((s) => s.path)).toEqual([".claude/a", ".claude/b"]);
    const a = result[0];
    expect(a).toMatchObject({ status: "outdated", templateSha: "2", repoSha: "9" });
    expect(result[1]).toMatchObject({ status: "missing", templateSha: "1", repoSha: null });
  });

  it("returns an empty list when neither side has hook files", () => {
    expect(classifyHooks(m({}), m({}))).toEqual([]);
  });
});

describe("isAcknowledged", () => {
  it("is false when nothing has been confirmed", () => {
    expect(
      isAcknowledged({
        repoSha: "r1",
        templateSha: "t1",
        acknowledgedRepoSha: null,
        acknowledgedTemplateSha: null,
      }),
    ).toBe(false);
  });

  it("is true only when the confirmed SHA pair matches the current one", () => {
    expect(
      isAcknowledged({
        repoSha: "r1",
        templateSha: "t1",
        acknowledgedRepoSha: "r1",
        acknowledgedTemplateSha: "t1",
      }),
    ).toBe(true);
  });

  it("re-flags when the repo OR the template file changed since it was confirmed", () => {
    expect(
      isAcknowledged({
        repoSha: "r2",
        templateSha: "t1",
        acknowledgedRepoSha: "r1",
        acknowledgedTemplateSha: "t1",
      }),
    ).toBe(false);
    expect(
      isAcknowledged({
        repoSha: "r1",
        templateSha: "t2",
        acknowledgedRepoSha: "r1",
        acknowledgedTemplateSha: "t1",
      }),
    ).toBe(false);
  });

  it("handles a confirmed missing file (repoSha null on both sides)", () => {
    expect(
      isAcknowledged({
        repoSha: null,
        templateSha: "t1",
        acknowledgedRepoSha: null,
        acknowledgedTemplateSha: "t1",
      }),
    ).toBe(true);
    // Unconfirmed (acks null) must not read as acknowledged despite the matching null repoSha.
    expect(
      isAcknowledged({
        repoSha: null,
        templateSha: "t1",
        acknowledgedRepoSha: null,
        acknowledgedTemplateSha: null,
      }),
    ).toBe(false);
  });
});
