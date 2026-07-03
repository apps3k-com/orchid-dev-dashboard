import { describe, expect, it } from "vitest";

import { mapTimelineNode, type RawTimelineNode } from "@/server/github/pull-timeline";

describe("mapTimelineNode", () => {
  it("maps an issue comment", () => {
    const node: RawTimelineNode = {
      __typename: "IssueComment",
      author: { login: "octocat", avatarUrl: "https://a/x.png" },
      createdAt: "2026-01-01T00:00:00Z",
      bodyText: "Looks good",
      url: "https://gh/c/1",
    };
    expect(mapTimelineNode(node)).toEqual({
      kind: "comment",
      actor: "octocat",
      avatarUrl: "https://a/x.png",
      createdAt: "2026-01-01T00:00:00Z",
      body: "Looks good",
      url: "https://gh/c/1",
    });
  });

  it("keeps a bodyless review (bare approval)", () => {
    const entry = mapTimelineNode({
      __typename: "PullRequestReview",
      author: { login: "rev" },
      createdAt: "2026-01-02T00:00:00Z",
      state: "APPROVED",
      bodyText: "",
    });
    expect(entry).toMatchObject({ kind: "review", state: "APPROVED", actor: "rev", body: "" });
  });

  it("prefers the commit author's user login, falling back to the name", () => {
    const withUser = mapTimelineNode({
      __typename: "PullRequestCommit",
      commit: {
        abbreviatedOid: "abc1234",
        messageHeadline: "fix: thing",
        committedDate: "2026-01-03T00:00:00Z",
        author: { user: { login: "dev", avatarUrl: "https://a/d.png" }, name: "Dev Name" },
      },
    });
    expect(withUser).toMatchObject({ kind: "commit", actor: "dev", abbreviatedOid: "abc1234" });

    const nameOnly = mapTimelineNode({
      __typename: "PullRequestCommit",
      commit: { messageHeadline: "chore", author: { name: "CI Bot" } },
    });
    expect(nameOnly).toMatchObject({ kind: "commit", actor: "CI Bot" });
  });

  it("returns null for a commit node with no commit payload", () => {
    expect(mapTimelineNode({ __typename: "PullRequestCommit" })).toBeNull();
  });

  it("distinguishes added vs removed labels", () => {
    expect(
      mapTimelineNode({
        __typename: "LabeledEvent",
        actor: { login: "maint" },
        label: { name: "bug", color: "d73a4a" },
      }),
    ).toMatchObject({ kind: "label", added: true, label: "bug", actor: "maint" });

    expect(
      mapTimelineNode({ __typename: "UnlabeledEvent", label: { name: "bug" } }),
    ).toMatchObject({ kind: "label", added: false, label: "bug" });
  });

  it("maps state events with a human detail", () => {
    expect(mapTimelineNode({ __typename: "MergedEvent", actor: { login: "m" } })).toMatchObject({
      kind: "event",
      event: "merged",
      actor: "m",
      detail: "merged this pull request",
    });
    expect(mapTimelineNode({ __typename: "ReadyForReviewEvent" })).toMatchObject({
      kind: "event",
      event: "ready",
    });
  });

  it("describes a review request with the reviewer when present", () => {
    expect(
      mapTimelineNode({
        __typename: "ReviewRequestedEvent",
        actor: { login: "author" },
        requestedReviewer: { login: "reviewer" },
      }),
    ).toMatchObject({ kind: "event", event: "review_requested", detail: "requested a review from reviewer" });

    expect(mapTimelineNode({ __typename: "ReviewRequestedEvent" })).toMatchObject({
      detail: "requested a review",
    });
  });

  it("returns null for an unknown node type", () => {
    expect(mapTimelineNode({ __typename: "SomeFutureEvent" })).toBeNull();
  });
});
