import { describe, expect, it } from "vitest";
import { mergeWorkflowBinding } from "./config";

describe("mergeWorkflowBinding", () => {
  it("replaces only the binding with the same repository and preserves todo dispatch", () => {
    const current = {
      todoDispatch: { enabled: true },
      bindings: [
        { repository: "apps3k-com/hetzner-cloud", statusTargets: { open: "In Progress" } },
        { repository: "apps3k-com/Venuemaster3000", statusTargets: { open: "In Progress" } },
      ],
    };
    const next = mergeWorkflowBinding(current, { repository: "apps3k-com/Venuemaster3000", workflow: { mode: "observe" } });
    expect(next.todoDispatch).toEqual({ enabled: true });
    expect(next.bindings).toEqual([
      { repository: "apps3k-com/hetzner-cloud", statusTargets: { open: "In Progress" } },
      { repository: "apps3k-com/Venuemaster3000", workflow: { mode: "observe" } },
    ]);
  });

  it("rejects an unaddressable proposed binding", () => {
    expect(() => mergeWorkflowBinding({ bindings: [] }, {})).toThrow(/repository identity/);
  });

  it("rejects an ambiguous existing repository binding", () => {
    expect(() => mergeWorkflowBinding({ bindings: [{ repository: "acme/widgets" }, { repository: "acme/widgets" }] }, { repository: "acme/widgets" })).toThrow(/duplicate bindings/);
  });
});
