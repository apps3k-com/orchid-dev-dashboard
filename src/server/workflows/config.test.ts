import { describe, expect, it, vi } from "vitest";

vi.mock("@/server/github/writeback", () => ({ repoClient: vi.fn() }));

import type { Repo } from "@prisma/client";
import { mergeWorkflowBinding } from "./config";
import { readWorkflowConfig } from "./config";
import { repoClient } from "@/server/github/writeback";

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

describe("readWorkflowConfig", () => {
  it("pins the config read to the resolved default-branch SHA", async () => {
    const request = vi.fn()
      .mockResolvedValueOnce({ data: { object: { sha: "snapshot-sha" } } })
      .mockResolvedValueOnce({ data: { type: "file", content: Buffer.from(JSON.stringify({ bindings: [] })).toString("base64") } });
    vi.mocked(repoClient).mockResolvedValue({
      octokit: { request }, owner: "acme", name: "widgets", base: "main",
    } as unknown as Awaited<ReturnType<typeof repoClient>>);

    await expect(readWorkflowConfig({} as Repo)).resolves.toEqual({ config: { bindings: [] }, headSha: "snapshot-sha" });
    expect(request).toHaveBeenNthCalledWith(1, "GET /repos/{owner}/{repo}/git/ref/{ref}", {
      owner: "acme", repo: "widgets", ref: "heads/main",
    });
    expect(request).toHaveBeenNthCalledWith(2, "GET /repos/{owner}/{repo}/contents/{path}", {
      owner: "acme", repo: "widgets", path: "configs/plane-github/config.json", ref: "snapshot-sha",
    });
  });
});
