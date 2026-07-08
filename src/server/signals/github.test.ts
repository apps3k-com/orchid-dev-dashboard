import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  mapGithubEvent,
  mapPullRequestCacheUpdate,
  verifyGithubSignature,
} from "./github";

const REPO = { full_name: "apps3k-com/demo", html_url: "https://github.com/apps3k-com/demo" };

describe("mapGithubEvent", () => {
  it("maps a pull_request event to a pr signal keyed by the delivery GUID", () => {
    const s = mapGithubEvent("d-1", "pull_request", {
      action: "reopened",
      repository: REPO,
      pull_request: {
        id: 42,
        number: 7,
        title: "Fix login",
        html_url: "https://github.com/apps3k-com/demo/pull/7",
        state: "open",
        updated_at: "2026-07-08T10:00:00Z",
      },
    });
    expect(s).toMatchObject({
      kind: "pr",
      severity: "info",
      title: "PR #7 reopened: Fix login",
      externalId: "42",
      dedupeKey: "github:pull_request:d-1",
      repoFullName: "apps3k-com/demo",
    });
    expect(s?.occurredAt.toISOString()).toBe("2026-07-08T10:00:00.000Z");
  });

  it("is idempotent per delivery: the same delivery maps to the same dedupeKey", () => {
    const payload = {
      action: "opened",
      repository: REPO,
      pull_request: { id: 1, number: 1, title: "x", state: "open" },
    };
    expect(mapGithubEvent("same", "pull_request", payload)?.dedupeKey).toBe(
      mapGithubEvent("same", "pull_request", payload)?.dedupeKey,
    );
    // A distinct occurrence (new delivery GUID) stays a distinct signal.
    expect(mapGithubEvent("other", "pull_request", payload)?.dedupeKey).not.toBe(
      mapGithubEvent("same", "pull_request", payload)?.dedupeKey,
    );
  });

  it("grades check_suite conclusions: failure → error, cancelled → warning, success → info", () => {
    const suite = (conclusion: string | null) => ({
      action: "completed",
      repository: REPO,
      check_suite: { id: 9, status: "completed", conclusion, head_branch: "main", head_sha: "abc" },
    });
    expect(mapGithubEvent("d", "check_suite", suite("failure"))?.severity).toBe("error");
    expect(mapGithubEvent("d", "check_suite", suite("timed_out"))?.severity).toBe("error");
    expect(mapGithubEvent("d", "check_suite", suite("cancelled"))?.severity).toBe("warning");
    expect(mapGithubEvent("d", "check_suite", suite("success"))?.severity).toBe("info");
  });

  it("grades deployment_status failure/error as error and keeps the environment in the title", () => {
    const s = mapGithubEvent("d", "deployment_status", {
      repository: REPO,
      deployment: { ref: "v1.2.0" },
      deployment_status: { id: 3, state: "failure", environment: "production", target_url: "https://x" },
    });
    expect(s).toMatchObject({ kind: "deploy", severity: "error", externalUrl: "https://x" });
    expect(s?.title).toContain("production");
  });

  it("maps a release event with the tag in the title", () => {
    const s = mapGithubEvent("d", "release", {
      action: "published",
      repository: REPO,
      release: { id: 5, tag_name: "v1.2.0", html_url: "https://rel", published_at: "2026-07-08T09:00:00Z" },
    });
    expect(s).toMatchObject({ kind: "release", title: "Release v1.2.0 published" });
  });

  it("keeps old + new field values for projects_v2_item edits (cycle analytics)", () => {
    const s = mapGithubEvent("d", "projects_v2_item", {
      action: "edited",
      projects_v2_item: { node_id: "PVTI_1", project_node_id: "PVT_1", content_type: "Issue", updated_at: "2026-07-08T08:00:00Z" },
      changes: { field_value: { field_name: "Status", from: { name: "Backlog" }, to: { name: "In Progress" } } },
    });
    expect(s).toMatchObject({ kind: "project_item", repoFullName: null, title: "Project item edited (Status)" });
    expect(s?.payload.fieldChange).toMatchObject({ field_name: "Status" });
  });

  it("returns null for events the spine does not ingest and for unusable payloads", () => {
    expect(mapGithubEvent("d", "ping", {})).toBeNull();
    expect(mapGithubEvent("d", "pull_request", { action: "opened" })).toBeNull();
  });
});

describe("mapPullRequestCacheUpdate", () => {
  const openPayload = {
    action: "opened",
    repository: REPO,
    pull_request: {
      node_id: "PR_1",
      number: 7,
      title: "Fix login",
      html_url: "https://github.com/apps3k-com/demo/pull/7",
      state: "open",
      draft: true,
      user: { login: "bvk" },
      base: { ref: "main" },
      head: { ref: "feature/login" },
      labels: [{ name: "bug" }, {}],
      updated_at: "2026-07-08T10:00:00Z",
    },
  };

  it("upserts an open PR with the fields the payload carries", () => {
    const u = mapPullRequestCacheUpdate(openPayload);
    expect(u).toMatchObject({
      op: "upsert",
      nodeId: "PR_1",
      repoFullName: "apps3k-com/demo",
      fields: {
        number: 7,
        state: "OPEN",
        isDraft: true,
        authorLogin: "bvk",
        baseRef: "main",
        headRef: "feature/login",
        labels: ["bug"],
      },
    });
  });

  it("drops a closed PR from the open-PR cache, carrying the event time for the staleness guard", () => {
    const u = mapPullRequestCacheUpdate({
      ...openPayload,
      action: "closed",
      pull_request: { ...openPayload.pull_request, state: "closed" },
    });
    expect(u).toEqual({
      op: "delete",
      nodeId: "PR_1",
      ghUpdatedAt: new Date("2026-07-08T10:00:00Z"),
    });
  });

  it("tolerates a closed PR without a timestamp (guard degrades to unconditional)", () => {
    const u = mapPullRequestCacheUpdate({
      action: "closed",
      repository: REPO,
      pull_request: { node_id: "PR_1", state: "closed" },
    });
    expect(u).toEqual({ op: "delete", nodeId: "PR_1", ghUpdatedAt: null });
  });

  it("returns null without a node_id", () => {
    expect(mapPullRequestCacheUpdate({ action: "opened" })).toBeNull();
  });
});

describe("verifyGithubSignature", () => {
  const secret = "s3cret";
  const body = JSON.stringify({ hello: "world" });
  const valid = `sha256=${createHmac("sha256", secret).update(body, "utf8").digest("hex")}`;

  it("accepts the matching signature", () => {
    expect(verifyGithubSignature(secret, body, valid)).toBe(true);
  });

  it("rejects a tampered body, a wrong scheme, and malformed hex", () => {
    expect(verifyGithubSignature(secret, body + "x", valid)).toBe(false);
    expect(verifyGithubSignature(secret, body, valid.replace("sha256=", "sha1="))).toBe(false);
    expect(verifyGithubSignature(secret, body, "sha256=zz")).toBe(false);
  });
});
