"use server";

import { revalidatePath } from "next/cache";

import { getSessionUser } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { isOrgMember } from "@/server/github/activation";
import { isNotFound } from "@/server/github/errors";
import { proposeFiles, repoClient } from "@/server/github/writeback";
import { enqueueAudit } from "@/server/jobs/enqueue";
import { isLlmAdmin } from "@/server/llm/admin";
import { getProviderKeySummaries } from "@/server/llm/keys";
import { PROVIDERS } from "@/server/llm/providers";
import { briefError } from "@/server/log";

/** Result of {@link requestAudit}, surfaced inline in the run form. */
export type AuditRequestState = { ok: boolean; message: string };

/** Server action: queue an LLM audit of a repo's agent/hook config. Gated to LLM admins (it spends
 *  tokens) and requires explicit consent (it sends the repo's config files to the provider). Creates
 *  a pending RepoAudit and enqueues the worker job; the result appears on reload. */
export async function requestAudit(
  _prev: AuditRequestState,
  formData: FormData,
): Promise<AuditRequestState> {
  const user = await getSessionUser();
  if (!user) return { ok: false, message: "Not signed in." };
  if (!isLlmAdmin(user.login)) return { ok: false, message: "Only an LLM admin can run audits." };

  const repoId = String(formData.get("repoId") ?? "");
  const consent = formData.get("consent");
  if (!repoId) return { ok: false, message: "Missing repository." };
  if (consent !== "on" && consent !== "true") {
    return { ok: false, message: "Please confirm sending this repo's config to the provider." };
  }

  const repo = await prisma.repo.findUnique({ where: { id: repoId } });
  if (!repo) return { ok: false, message: "Repository not found." };

  const anthropic = (await getProviderKeySummaries()).find((s) => s.provider === "anthropic");
  if (!anthropic?.configured || anthropic.status !== "valid") {
    return {
      ok: false,
      message: "Configure a valid Anthropic key in Settings → AI providers first.",
    };
  }
  const model = anthropic.selectedModel ?? PROVIDERS.anthropic.defaultModel;

  let auditId: string | null = null;
  try {
    const audit = await prisma.repoAudit.create({
      data: { repoId, provider: "anthropic", model, status: "pending", triggeredByLogin: user.login },
    });
    auditId = audit.id;
    // Whether enqueue returns false (no queue) or throws, the row must not be left "pending".
    if (!(await enqueueAudit(audit.id))) throw new Error("No queue configured to run the audit.");
    revalidatePath(`/repos/${repoId}/audit`);
    return { ok: true, message: "Audit queued — reload in a moment to see the result." };
  } catch (error) {
    if (auditId) {
      await prisma.repoAudit
        .update({
          where: { id: auditId },
          data: { status: "failed", error: "Could not enqueue.", completedAt: new Date() },
        })
        .catch(() => {});
    }
    console.warn("requestAudit failed", briefError(error));
    return { ok: false, message: "Could not queue the audit — please try again." };
  }
}

/** Result of {@link applyFix}, surfaced inline next to the finding (with the new PR URL). */
export type FixState = { ok: boolean; message: string; prUrl?: string };

/** Server action: open a PR applying an auto-fixable finding's proposed file content to the repo.
 *  Write-back is PR-only; gated to members of the target repo's org (repoId/findingId are client
 *  input). Marks the finding `pr_opened` with the PR URL on success. */
export async function applyFix(_prev: FixState, formData: FormData): Promise<FixState> {
  const user = await getSessionUser();
  if (!user) return { ok: false, message: "Not signed in." };

  const findingId = String(formData.get("findingId") ?? "");
  if (!findingId) return { ok: false, message: "Missing finding." };

  const finding = await prisma.auditFinding.findUnique({
    where: { id: findingId },
    include: { audit: { include: { repo: true } } },
  });
  if (!finding) return { ok: false, message: "Finding not found." };
  // `== null` (not truthiness): an empty-string proposedPatch is valid full-replacement content.
  if (!finding.autoFixable || finding.proposedPatch == null) {
    return { ok: false, message: "This finding has no automatic fix." };
  }
  // Auto-fix only modifies EXISTING audited files. A `missing` finding's file does not exist yet, so
  // its path is only surface-constrained (not confirmed-present) — don't create new files (e.g. a new
  // workflow) via auto-PR; the user adds those manually from the recommendation.
  if (finding.category === "missing") {
    return { ok: false, message: "Auto-fix edits existing files only — add the missing file manually." };
  }
  if (finding.state === "pr_opened" && finding.prUrl) {
    return { ok: true, message: "A fix PR is already open.", prUrl: finding.prUrl };
  }

  const repo = finding.audit.repo;
  const org = await prisma.org.findUnique({ where: { id: repo.orgId } });
  if (!org) return { ok: false, message: "Organization not found." };
  try {
    if (!(await isOrgMember(org, user.login))) {
      return { ok: false, message: `You are not a member of ${org.login}.` };
    }
  } catch (error) {
    console.warn("applyFix membership check failed", briefError(error));
    return { ok: false, message: "Could not verify your organization membership — please try again." };
  }

  // Re-check the file still exists on the default branch (audit-time state can be stale). We only
  // edit existing files — never let proposeFiles silently create a new one for a since-deleted path.
  try {
    const { octokit, owner, name, base } = await repoClient(repo);
    await octokit.request("GET /repos/{owner}/{repo}/contents/{path}", {
      owner,
      repo: name,
      path: finding.file,
      ref: base,
    });
  } catch (error) {
    if (isNotFound(error)) {
      return { ok: false, message: "That file no longer exists on the default branch — re-run the audit." };
    }
    console.warn("applyFix existence check failed", briefError(error));
    return { ok: false, message: "Could not verify the file — please try again." };
  }

  try {
    const { prUrl } = await proposeFiles(repo, [{ path: finding.file, content: finding.proposedPatch }], {
      branchPrefix: "orchid/audit-fix",
      commitMessage: `chore(agents): ${finding.title}`,
      title: `chore(agents): ${finding.title}`,
      body:
        `Auto-generated from an Orchid audit finding.\n\n` +
        `**${finding.severity} · ${finding.category}** — ${finding.rationale}\n\n${finding.recommendation}`,
    });
    await prisma.auditFinding
      .update({ where: { id: findingId }, data: { state: "pr_opened", prUrl } })
      .catch(() => {}); // PR is open (the outcome); a tracking-update failure must not report failure
    revalidatePath(`/repos/${repo.id}/audit`);
    return { ok: true, message: "Opened a fix pull request.", prUrl };
  } catch (error) {
    console.warn("applyFix PR failed", briefError(error));
    return { ok: false, message: "Could not open the fix PR — check branch protection and retry." };
  }
}
