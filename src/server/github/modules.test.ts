import { describe, expect, it, vi } from "vitest";

// getRepoModules resolves an installation Octokit via repoClient — mock it so the test drives the
// GraphQL result shape directly. proposeFiles is mocked only so the module imports cleanly.
vi.mock("@/server/github/writeback", () => ({
  repoClient: vi.fn(),
  proposeFiles: vi.fn(),
}));

import type { Repo } from "@prisma/client";

import { getRepoModules } from "@/server/github/modules";
import { renderModulesYaml } from "@/server/github/modules-yaml";
import { repoClient } from "@/server/github/writeback";

const repo = {} as Repo; // only forwarded to the mocked repoClient

function mockGraphql(result: unknown) {
  vi.mocked(repoClient).mockResolvedValue({
    octokit: { graphql: vi.fn().mockResolvedValue(result) },
    owner: "acme",
    name: "widgets",
    base: "main",
  } as unknown as Awaited<ReturnType<typeof repoClient>>);
}

describe("getRepoModules", () => {
  it("parses the modules when the file exists", async () => {
    mockGraphql({ repository: { object: { text: renderModulesYaml(["api", "web"]) } } });
    await expect(getRepoModules(repo)).resolves.toEqual(["api", "web"]);
  });

  it("returns an empty list when the file is absent (object === null)", async () => {
    mockGraphql({ repository: { object: null } });
    await expect(getRepoModules(repo)).resolves.toEqual([]);
  });

  it("throws when the repository is inaccessible (repository === null)", async () => {
    mockGraphql({ repository: null });
    await expect(getRepoModules(repo)).rejects.toThrow(/not found or inaccessible/);
  });

  it("throws when the path is not a readable text blob (text === null)", async () => {
    mockGraphql({ repository: { object: { text: null } } });
    await expect(getRepoModules(repo)).rejects.toThrow(/not a readable text file/);
  });
});
