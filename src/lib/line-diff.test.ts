import { describe, expect, it } from "vitest";

import { lineDiff } from "./line-diff";

describe("lineDiff", () => {
  it("marks unchanged, removed, and added lines", () => {
    expect(lineDiff("a\nb\nc", "a\nX\nc")).toEqual([
      { type: "same", text: "a" },
      { type: "remove", text: "b" },
      { type: "add", text: "X" },
      { type: "same", text: "c" },
    ]);
  });

  it("treats an empty side as all-added / all-removed (not one blank line)", () => {
    expect(lineDiff("", "x\ny")).toEqual([
      { type: "add", text: "x" },
      { type: "add", text: "y" },
    ]);
    expect(lineDiff("x\ny", "")).toEqual([
      { type: "remove", text: "x" },
      { type: "remove", text: "y" },
    ]);
  });

  it("returns all-same for identical text", () => {
    expect(lineDiff("a\nb", "a\nb")).toEqual([
      { type: "same", text: "a" },
      { type: "same", text: "b" },
    ]);
  });
});
