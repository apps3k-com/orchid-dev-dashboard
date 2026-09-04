import { describe, expect, it, vi } from "vitest";

vi.mock("@/server/db", () => ({ prisma: { org: { findUnique: vi.fn() } } }));
vi.mock("@/server/github/app", () => ({ getInstallationOctokit: vi.fn() }));

import type { Repo } from "@prisma/client";
import { prisma } from "@/server/db";
import { getInstallationOctokit } from "@/server/github/app";
import { proposeFiles } from "./writeback";

describe("proposeFiles", () => {
  it("rejects a stale reviewed base SHA before creating a remote branch", async () => {
    const request = vi.fn().mockResolvedValue({ data: { object: { sha: "current-sha" } } });
    vi.mocked(prisma.org.findUnique).mockResolvedValue({ installationId: 1 } as never);
    vi.mocked(getInstallationOctokit).mockResolvedValue({ request } as never);

    await expect(proposeFiles({ orgId: "org", nameWithOwner: "acme/widgets", defaultBranch: "main" } as Repo, [
      { path: "configs/plane-github/config.json", content: "{}" },
    ], {
      branchPrefix: "orchid/test",
      title: "test",
      body: "test",
      commitMessage: "test",
      expectedBaseSha: "reviewed-sha",
    })).rejects.toThrow(/Default branch changed/);

    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith("GET /repos/{owner}/{repo}/git/ref/{ref}", {
      owner: "acme", repo: "widgets", ref: "heads/main",
    });
  });
});
