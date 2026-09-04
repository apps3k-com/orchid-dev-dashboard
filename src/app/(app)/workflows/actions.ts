"use server";

import { z } from "zod";
import { getSessionUser } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { isOrgMember } from "@/server/github/activation";
import { proposeFiles } from "@/server/github/writeback";
import { briefError } from "@/server/log";
import { isWorkflowAdmin } from "@/server/workflows/admin";
import { reconcileWorkflow, simulateWorkflowProfile } from "@/server/workflows/client";
import { mergeWorkflowBinding, readWorkflowConfig, WORKFLOW_CONFIG_PATH } from "@/server/workflows/config";
import { localPlaybook } from "@/server/workflows/playbook";
import type { WorkflowDelivery, WorkflowProfile, WorkflowSimulation } from "@/server/workflows/types";

const profileSchema = z.object({
  id: z.string().min(1).max(120),
  repository: z.string().regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/),
  workspaceSlug: z.string().min(1).max(100),
  projectId: z.string().min(1).max(120),
  projectIdentifier: z.string().min(1).max(40),
  defaultBranch: z.string().min(1).max(120),
  mode: z.enum(["observe", "full"]),
  preview: z.object({
    provider: z.literal("coolify"),
    applicationId: z.string().min(1).max(160),
    urlTemplate: z.string().url().max(1000),
  }),
  staging: z.object({ workflow: z.string().min(1).max(200), artifactPrefix: z.string().min(1).max(200) }),
  states: z.object({
    inProgress: z.string().min(1).max(120),
    inReview: z.string().min(1).max(120),
    onStaging: z.string().min(1).max(120),
    readyForRelease: z.string().min(1).max(120),
    done: z.string().min(1).max(120),
    cancelled: z.string().min(1).max(120),
  }),
});

const closingReference = /^Closes [A-Z][A-Z0-9]*-[1-9][0-9]*$/;

export type WorkflowActionState = {
  ok: boolean;
  message: string;
  simulation?: WorkflowSimulation;
  deliveries?: WorkflowDelivery[];
  mode?: "observe" | "full";
  prUrl?: string;
};

/** Return the configured OAuth user only when the workflow-control allowlist authorizes it. */
async function workflowAdmin(): Promise<{ login: string } | null> {
  const user = await getSessionUser();
  return user && isWorkflowAdmin(user.login) ? { login: user.login } : null;
}

/** Decode a profile carried in a hidden form field, rejecting untrusted malformed browser input. */
function profileFromForm(formData: FormData): WorkflowProfile {
  const raw = formData.get("profile");
  if (typeof raw !== "string") throw new Error("Workflow profile is required.");
  let decoded: unknown;
  try {
    decoded = JSON.parse(raw);
  } catch {
    throw new Error("Workflow profile is malformed.");
  }
  return profileSchema.parse(decoded);
}

/** Simulate a profile against live bridge source mappings without changing Plane or configuration. */
export async function simulateProfile(
  _previous: WorkflowActionState,
  formData: FormData,
): Promise<WorkflowActionState> {
  if (!(await workflowAdmin())) return { ok: false, message: "Only a workflow administrator can simulate profiles." };
  try {
    const profile = profileFromForm(formData);
    const simulation = await simulateWorkflowProfile(profile);
    return {
      ok: simulation.valid,
      message: simulation.valid ? "Live bridge simulation passed. No configuration was changed." : "Simulation found validation errors.",
      simulation: { ...simulation, playbook: simulation.playbook || localPlaybook(profile) },
    };
  } catch (error) {
    console.error("workflow simulation failed", briefError(error));
    return { ok: false, message: error instanceof Error ? error.message : "Could not simulate workflow profile." };
  }
}

/** Reconcile by request only; the bridge evaluates original evidence and remains the only Plane writer. */
export async function reconcileProfile(
  _previous: WorkflowActionState,
  formData: FormData,
): Promise<WorkflowActionState> {
  if (!(await workflowAdmin())) return { ok: false, message: "Only a workflow administrator can reconcile deliveries." };
  const repository = String(formData.get("repository") ?? "").trim();
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) return { ok: false, message: "Choose a configured repository." };
  const pullRequestRaw = String(formData.get("pullRequest") ?? "").trim();
  const promotionRunRaw = String(formData.get("promotionRunId") ?? "").trim();
  const apply = formData.get("apply") === "true";
  const pullRequest = pullRequestRaw ? Number(pullRequestRaw) : undefined;
  const promotionRunId = promotionRunRaw ? Number(promotionRunRaw) : undefined;
  if ((pullRequest !== undefined && (!Number.isSafeInteger(pullRequest) || pullRequest < 1)) ||
      (promotionRunId !== undefined && (!Number.isSafeInteger(promotionRunId) || promotionRunId < 1))) {
    return { ok: false, message: "Pull request and promotion run identifiers must be positive integers." };
  }
  try {
    const result = await reconcileWorkflow({ repository, pullRequest, promotionRunId, apply });
    return {
      ok: true,
      message: result.mode === "full" ? "Bridge reconciliation completed in full mode." : "Bridge reconciliation completed in observe mode.",
      deliveries: result.deliveries,
      mode: result.mode,
    };
  } catch (error) {
    console.error("workflow reconciliation failed", briefError(error));
    return { ok: false, message: error instanceof Error ? error.message : "Could not reconcile deliveries." };
  }
}

/** Propose the bridge-evaluated binding in the configured infra repo; no browser action activates it. */
export async function proposeWorkflowProfile(
  _previous: WorkflowActionState,
  formData: FormData,
): Promise<WorkflowActionState> {
  const user = await workflowAdmin();
  if (!user) return { ok: false, message: "Only a workflow administrator can open configuration pull requests." };
  const primaryClosingReference = String(formData.get("primaryClosingReference") ?? "").trim();
  if (!closingReference.test(primaryClosingReference)) {
    return { ok: false, message: "Provide one primary closing reference, for example `Closes A3KCL-123`." };
  }
  try {
    const profile = profileFromForm(formData);
    const simulation = await simulateWorkflowProfile(profile);
    if (!simulation.valid || !simulation.proposedBinding) {
      return { ok: false, message: "Profile is not validated by the live bridge; no pull request was opened.", simulation };
    }
    const infraRepository = process.env.WORKFLOW_INFRA_REPOSITORY;
    if (!infraRepository) return { ok: false, message: "Workflow infrastructure repository is not configured." };
    const repo = await prisma.repo.findUnique({ where: { nameWithOwner: infraRepository }, include: { org: true } });
    if (!repo) return { ok: false, message: "Workflow infrastructure repository is not available in Orchid." };
    if (!(await isOrgMember(repo.org, user.login))) return { ok: false, message: "You are not a member of the workflow infrastructure organization." };
    const { config: current, headSha } = await readWorkflowConfig(repo);
    const next = mergeWorkflowBinding(current, simulation.proposedBinding);
    const { prUrl } = await proposeFiles(repo, [{ path: WORKFLOW_CONFIG_PATH, content: `${JSON.stringify(next, null, 2)}\n` }], {
      branchPrefix: "orchid/workflow-profile",
      commitMessage: `feat(workflow): add ${profile.repository} profile`,
      title: `feat(workflow): add ${profile.repository} profile`,
      body:
        `${primaryClosingReference}\n\n` +
        `Adds the bridge-validated workflow profile for \`${profile.repository}\` through Orchid.\n\n` +
        "This PR changes configuration only. Merging it is required before the bridge can activate the profile.",
      mustExist: true,
      expectedBaseSha: headSha,
    });
    return { ok: true, message: "Opened a configuration pull request; the profile is not active until that PR merges.", prUrl, simulation };
  } catch (error) {
    console.error("workflow profile proposal failed", briefError(error));
    return { ok: false, message: error instanceof Error ? error.message : "Could not open workflow configuration pull request." };
  }
}
