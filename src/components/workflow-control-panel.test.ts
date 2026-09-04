import { describe, expect, it } from "vitest";
import { safeExternalHref } from "./workflow-control-panel";

describe("safeExternalHref", () => {
  /** Provider links remain clickable only for ordinary web protocols. */
  it("allows HTTP(S) and rejects executable or malformed URLs", () => {
    expect(safeExternalHref("https://github.com/apps3k-com/orchid-dev-dashboard")).toBe("https://github.com/apps3k-com/orchid-dev-dashboard");
    expect(safeExternalHref("http://localhost:3000/workflows")).toBe("http://localhost:3000/workflows");
    expect(safeExternalHref("javascript:alert(1)")).toBeUndefined();
    expect(safeExternalHref("data:text/html,test")).toBeUndefined();
    expect(safeExternalHref("not a url")).toBeUndefined();
  });
});
