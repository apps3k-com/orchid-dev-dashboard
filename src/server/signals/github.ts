import { createHmac, timingSafeEqual } from "node:crypto";

import type { Prisma } from "@prisma/client";

import { prisma } from "@/server/db";
import { briefError } from "@/server/log";

// Webhook events the event spine ingests (must match the App manifest's default_events).
export const INGESTED_GITHUB_EVENTS = [
  "pull_request",
  "issues",
  "check_suite",
  "deployment_status",
  "release",
  "projects_v2_item",
] as const;

/** Normalized signal derived from one GitHub webhook delivery (pure mapping output). */
export interface GithubSignalInput {
  kind: "pr" | "issue" | "check" | "deploy" | "release" | "project_item";
  severity: "info" | "warning" | "error";
  title: string;
  externalId: string;
  externalUrl: string | null;
  dedupeKey: string;
  repoFullName: string | null;
  occurredAt: Date;
  payload: Record<string, unknown>;
}

/** Cache write-through instruction derived from a `pull_request` webhook payload. */
export type PullCacheUpdate =
  | { op: "delete"; nodeId: string; ghUpdatedAt: Date | null }
  | {
      op: "upsert";
      nodeId: string;
      repoFullName: string;
      fields: {
        number: number;
        title: string;
        url: string;
        state: string;
        isDraft: boolean;
        authorLogin: string | null;
        baseRef: string;
        headRef: string | null;
        labels: string[];
        ghUpdatedAt: Date | null;
      };
    };

/** The (deeply optional) slice of a GitHub webhook payload the event spine reads. */
interface WebhookPayload {
  action?: string;
  repository?: { full_name?: string; html_url?: string };
  pull_request?: {
    id?: number;
    node_id?: string;
    number?: number;
    title?: string;
    html_url?: string;
    state?: string;
    merged?: boolean;
    draft?: boolean;
    updated_at?: string;
    user?: { login?: string };
    base?: { ref?: string };
    head?: { ref?: string };
    labels?: Array<{ name?: string }>;
  };
  issue?: { id?: number; number?: number; title?: string; html_url?: string; state?: string; updated_at?: string };
  check_suite?: {
    id?: number;
    status?: string;
    conclusion?: string | null;
    head_branch?: string;
    head_sha?: string;
    updated_at?: string;
    app?: { name?: string };
  };
  deployment_status?: { id?: number; state?: string; environment?: string; target_url?: string; updated_at?: string };
  deployment?: { ref?: string; url?: string; environment?: string };
  release?: {
    id?: number;
    tag_name?: string;
    name?: string;
    html_url?: string;
    draft?: boolean;
    published_at?: string;
    created_at?: string;
  };
  projects_v2_item?: { node_id?: string; project_node_id?: string; content_type?: string; updated_at?: string };
  changes?: { field_value?: { field_name?: string } & Record<string, unknown> };
}

/** ISO timestamp → Date, or null when absent/invalid (webhook payloads are untrusted input). */
function toDate(value: unknown): Date | null {
  if (typeof value !== "string") return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** The repo `full_name` carried by (repo-scoped) webhook payloads, or null (org-level events). */
function repoFullName(payload: WebhookPayload): string | null {
  const name = payload?.repository?.full_name;
  return typeof name === "string" ? name : null;
}

/**
 * Map one GitHub webhook delivery to a normalized Signal (pure — unit-tested). Returns null for
 * events the spine does not ingest (e.g. `ping`) or structurally unusable payloads.
 *
 * The `dedupeKey` is derived from the delivery GUID (`X-GitHub-Delivery`): GitHub reuses it on
 * redeliveries, so retries upsert onto the same row while distinct occurrences of the same
 * entity/action (new GUID) stay distinct — the spec's ingest-idempotency contract.
 */
export function mapGithubEvent(
  deliveryId: string,
  event: string,
  payload: WebhookPayload,
): GithubSignalInput | null {
  const dedupeKey = `github:${event}:${deliveryId}`;
  const action = typeof payload?.action === "string" ? payload.action : null;
  const repo = repoFullName(payload);

  switch (event) {
    case "pull_request": {
      const pr = payload?.pull_request;
      if (!pr?.number) return null;
      return {
        kind: "pr",
        severity: "info",
        title: `PR #${pr.number} ${action ?? "updated"}: ${pr.title ?? ""}`.trim(),
        externalId: String(pr.id ?? pr.number),
        externalUrl: pr.html_url ?? null,
        dedupeKey,
        repoFullName: repo,
        occurredAt: toDate(pr.updated_at) ?? new Date(0),
        payload: { action, number: pr.number, state: pr.state ?? null, merged: pr.merged ?? null },
      };
    }
    case "issues": {
      const issue = payload?.issue;
      if (!issue?.number) return null;
      return {
        kind: "issue",
        severity: "info",
        title: `Issue #${issue.number} ${action ?? "updated"}: ${issue.title ?? ""}`.trim(),
        externalId: String(issue.id ?? issue.number),
        externalUrl: issue.html_url ?? null,
        dedupeKey,
        repoFullName: repo,
        occurredAt: toDate(issue.updated_at) ?? new Date(0),
        payload: { action, number: issue.number, state: issue.state ?? null },
      };
    }
    case "check_suite": {
      const suite = payload?.check_suite;
      if (!suite?.id) return null;
      const conclusion: string | null = suite.conclusion ?? null;
      const severity =
        conclusion === "failure" || conclusion === "timed_out" || conclusion === "startup_failure"
          ? "error"
          : conclusion === "cancelled"
            ? "warning"
            : "info";
      const appName = suite.app?.name ?? "checks";
      return {
        kind: "check",
        severity,
        title: `Check suite ${conclusion ?? suite.status ?? action ?? "updated"} (${appName}) on ${suite.head_branch ?? "?"}`,
        externalId: String(suite.id),
        externalUrl: payload?.repository?.html_url
          ? `${payload.repository.html_url}/commits/${suite.head_sha ?? ""}`
          : null,
        dedupeKey,
        repoFullName: repo,
        occurredAt: toDate(suite.updated_at) ?? new Date(0),
        payload: { action, status: suite.status ?? null, conclusion, headBranch: suite.head_branch ?? null },
      };
    }
    case "deployment_status": {
      const status = payload?.deployment_status;
      if (!status?.id) return null;
      const state: string | null = status.state ?? null;
      return {
        kind: "deploy",
        severity: state === "failure" || state === "error" ? "error" : "info",
        title: `Deployment ${state ?? "updated"} (${status.environment ?? payload?.deployment?.environment ?? "?"})`,
        externalId: String(status.id),
        externalUrl: status.target_url || payload?.deployment?.url || null,
        dedupeKey,
        repoFullName: repo,
        occurredAt: toDate(status.updated_at) ?? new Date(0),
        payload: { action, state, environment: status.environment ?? null, ref: payload?.deployment?.ref ?? null },
      };
    }
    case "release": {
      const release = payload?.release;
      if (!release?.id) return null;
      return {
        kind: "release",
        severity: "info",
        title: `Release ${release.tag_name ?? release.name ?? "?"} ${action ?? "updated"}`,
        externalId: String(release.id),
        externalUrl: release.html_url ?? null,
        dedupeKey,
        repoFullName: repo,
        occurredAt: toDate(release.published_at) ?? toDate(release.created_at) ?? new Date(0),
        payload: { action, tag: release.tag_name ?? null, draft: release.draft ?? null },
      };
    }
    case "projects_v2_item": {
      const item = payload?.projects_v2_item;
      if (!item?.node_id) return null;
      const fieldChange = payload?.changes?.field_value ?? null;
      const fieldName = fieldChange?.field_name ?? null;
      return {
        kind: "project_item",
        severity: "info",
        title: fieldName ? `Project item ${action ?? "edited"} (${fieldName})` : `Project item ${action ?? "updated"}`,
        externalId: String(item.node_id),
        externalUrl: null, // org-level event; the item payload carries no html url
        dedupeKey,
        repoFullName: null,
        occurredAt: toDate(item.updated_at) ?? new Date(0),
        payload: {
          action,
          itemNodeId: item.node_id,
          projectNodeId: item.project_node_id ?? null,
          contentType: item.content_type ?? null,
          // Preserved verbatim for phase C's cycle analytics: old + new field values.
          fieldChange,
        },
      };
    }
    default:
      return null;
  }
}

/**
 * Derive the open-PR cache write-through from a `pull_request` webhook payload (pure —
 * unit-tested). Closed/merged PRs are dropped (the cache holds open PRs only, matching
 * `syncPulls`); everything else upserts the fields the payload actually carries.
 * `reviewDecision`/`checksState`/`mergeable` are NOT part of the instruction — the webhook
 * payload doesn't know them reliably; the polling sync keeps filling those in.
 */
export function mapPullRequestCacheUpdate(payload: WebhookPayload): PullCacheUpdate | null {
  const pr = payload?.pull_request;
  if (!pr?.node_id) return null;
  if (pr.state === "closed") {
    return { op: "delete", nodeId: pr.node_id, ghUpdatedAt: toDate(pr.updated_at) };
  }
  const repo = repoFullName(payload);
  if (!repo || typeof pr.number !== "number") return null;
  return {
    op: "upsert",
    nodeId: pr.node_id,
    repoFullName: repo,
    fields: {
      number: pr.number,
      title: pr.title ?? "",
      url: pr.html_url ?? "",
      state: "OPEN",
      isDraft: Boolean(pr.draft),
      authorLogin: pr.user?.login ?? null,
      baseRef: pr.base?.ref ?? "main",
      headRef: pr.head?.ref ?? null,
      labels: Array.isArray(pr.labels)
        ? pr.labels.map((l: { name?: string }) => l?.name).filter((n: unknown): n is string => typeof n === "string")
        : [],
      ghUpdatedAt: toDate(pr.updated_at),
    },
  };
}

/**
 * Verify a GitHub `X-Hub-Signature-256` header against the raw request body (constant-time).
 * Returns false for malformed headers instead of throwing.
 */
export function verifyGithubSignature(secret: string, body: string, signatureHeader: string): boolean {
  if (!signatureHeader.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", secret).update(body, "utf8").digest("hex");
  const provided = signatureHeader.slice("sha256=".length);
  if (provided.length !== expected.length) return false;
  try {
    return timingSafeEqual(Buffer.from(provided, "hex"), Buffer.from(expected, "hex"));
  } catch {
    return false;
  }
}

/**
 * Process one queued GitHub webhook delivery: upsert the normalized Signal (idempotent on
 * `dedupeKey`) and apply the open-PR cache write-through for `pull_request` events so the UI
 * reflects the change without waiting for the 5-minute cron. Server-only (worker task body).
 */
export async function processGithubEvent(job: {
  deliveryId: string;
  event: string;
  payload: unknown;
}): Promise<void> {
  const payload = (job.payload ?? {}) as WebhookPayload;
  const mapped = mapGithubEvent(job.deliveryId, job.event, payload);
  if (!mapped) return;

  const repo = mapped.repoFullName
    ? await prisma.repo.findUnique({ where: { nameWithOwner: mapped.repoFullName } })
    : null;

  const fields = {
    source: "github",
    kind: mapped.kind,
    severity: mapped.severity,
    title: mapped.title,
    externalId: mapped.externalId,
    externalUrl: mapped.externalUrl,
    // The mapper only emits JSON-safe values; Prisma's Json input type can't see that statically.
    payload: mapped.payload as Prisma.InputJsonValue,
    repoId: repo?.id ?? null,
    occurredAt: mapped.occurredAt,
  };
  await prisma.signal.upsert({
    where: { dedupeKey: mapped.dedupeKey },
    create: { dedupeKey: mapped.dedupeKey, ...fields },
    update: fields,
  });

  if (job.event === "pull_request") {
    try {
      await applyPullCacheUpdate(mapPullRequestCacheUpdate(payload));
    } catch (error) {
      // The Signal row is already written — a cache hiccup must not fail (and re-run) the job.
      console.warn("ingest:github pull cache write-through failed", briefError(error));
    }
  }
}

/**
 * Apply a derived open-PR cache instruction (delete on close, upsert otherwise) with a
 * staleness guard: worker `concurrency: 2` can process two deliveries for the same PR out of
 * order, so writes only apply when the incoming `ghUpdatedAt` is not older than the cached one
 * (conditional `updateMany`/`deleteMany` — guarded in the WHERE clause, not read-then-write).
 * Rows without a cached timestamp always accept the write.
 */
async function applyPullCacheUpdate(update: PullCacheUpdate | null): Promise<void> {
  if (!update) return;
  if (update.op === "delete") {
    await prisma.pullRequest.deleteMany({
      where: {
        nodeId: update.nodeId,
        // A stale "closed" event must not delete a row a newer event already refreshed.
        ...(update.ghUpdatedAt
          ? { OR: [{ ghUpdatedAt: null }, { ghUpdatedAt: { lte: update.ghUpdatedAt } }] }
          : {}),
      },
    });
    return;
  }
  const repo = await prisma.repo.findUnique({ where: { nameWithOwner: update.repoFullName } });
  if (!repo) return; // repo not cached yet — the next syncRepos run picks it up
  const fields = { repoId: repo.id, ...update.fields, syncedAt: new Date() };
  const incoming = update.fields.ghUpdatedAt;
  const updated = await prisma.pullRequest.updateMany({
    where: {
      nodeId: update.nodeId,
      ...(incoming ? { OR: [{ ghUpdatedAt: null }, { ghUpdatedAt: { lte: incoming } }] } : {}),
    },
    data: fields,
  });
  if (updated.count > 0) return;
  // Nothing updated: either a newer state is cached (done) or the row doesn't exist yet.
  const exists = await prisma.pullRequest.findUnique({
    where: { nodeId: update.nodeId },
    select: { id: true },
  });
  if (exists) return;
  try {
    await prisma.pullRequest.create({ data: { nodeId: update.nodeId, ...fields } });
  } catch {
    // Unique-violation race: a concurrent job created the row (with its own, possibly newer,
    // state) between our check and create — that writer's guard already decided; nothing to do.
  }
}
