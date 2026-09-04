import type {
  WorkflowDeliveriesResponse,
  WorkflowDelivery,
  WorkflowProfile,
  WorkflowSimulation,
} from "./types";
import { z } from "zod";

type BridgeErrorBody = { error?: unknown };

const profileSchema = z.object({
  id: z.string(), repository: z.string(), workspaceSlug: z.string(), projectId: z.string(),
  projectIdentifier: z.string(), defaultBranch: z.string(), mode: z.enum(["observe", "full"]),
  preview: z.object({ provider: z.literal("coolify"), applicationId: z.string(), urlTemplate: z.string() }),
  staging: z.object({ workflow: z.string(), artifactPrefix: z.string(), requiredAssertions: z.array(z.string()).optional() }),
  states: z.object({ inProgress: z.string(), inReview: z.string(), onStaging: z.string(), readyForRelease: z.string(), done: z.string(), cancelled: z.string() }),
});
const decisionSchema = z.object({ from: z.string(), to: z.string().nullable(), reason: z.string(), applied: z.boolean(), at: z.string() });
const deliverySchema = z.object({
  repository: z.string(), workItem: z.string(), workItemId: z.string(), title: z.string(), currentState: z.string(), expectedState: z.string().nullable(), reason: z.string(),
  pullRequest: z.object({ number: z.number(), url: z.string(), headSha: z.string(), mergeSha: z.string().nullable(), draft: z.boolean(), merged: z.boolean() }).nullable(),
  preview: z.object({ status: z.string(), sha: z.string(), url: z.string(), deploymentId: z.string(), deploymentUrl: z.string().nullable().optional() }).nullable(),
  staging: z.object({ status: z.string(), sha: z.string(), releaseTag: z.string(), runId: z.number(), url: z.string() }).nullable(),
  release: z.object({ tag: z.string(), sha: z.string(), url: z.string(), publishedAt: z.string() }).nullable(),
  checks: z.array(z.object({ name: z.string(), status: z.string(), conclusion: z.string().nullable(), url: z.string().nullable() })).optional(),
  decisions: z.array(decisionSchema), updatedAt: z.string(),
});
const simulationSchema = z.object({
  valid: z.boolean(), errors: z.array(z.string()), profile: profileSchema,
  proposedBinding: z.record(z.unknown()).nullable(), decisions: z.array(decisionSchema), playbook: z.string(),
});

/** Resolve the fixed bridge origin. Profiles cannot select an arbitrary remote endpoint. */
function bridgeUrl(path: string): URL {
  const origin = process.env.WORKFLOW_BRIDGE_URL?.replace(/\/+$/, "");
  if (!origin) throw new Error("Workflow bridge is not configured.");
  return new URL(`/api/v1${path}`, origin);
}

/** Make a server-side bridge request without exposing tokens or provider response bodies. */
async function request<T>(
  path: string,
  init: RequestInit = {},
  operator = false,
): Promise<T> {
  const token = process.env[operator ? "BRIDGE_OPERATOR_TOKEN" : "BRIDGE_READ_TOKEN"];
  if (!token) throw new Error(operator ? "Workflow operator token is not configured." : "Workflow read token is not configured.");
  const response = await fetch(bridgeUrl(path), {
    ...init,
    signal: init.signal ?? AbortSignal.timeout(60_000),
    cache: "no-store",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
  });
  if (!response.ok) {
    let message = "Workflow bridge request failed.";
    try {
      const body = (await response.json()) as BridgeErrorBody;
      if (typeof body.error === "string") message = body.error;
    } catch {
      // Provider bodies may be sensitive or malformed; never return them.
    }
    throw new Error(message);
  }
  return response.json() as Promise<T>;
}

/** List live profiles known to the bridge. */
export async function listWorkflowProfiles(): Promise<WorkflowProfile[]> {
  const result = await request<unknown>("/profiles");
  const parsed = z.object({ schemaVersion: z.literal(1), profiles: z.array(profileSchema).max(50) }).safeParse(result);
  if (!parsed.success) throw new Error("Workflow bridge returned an unsupported profiles response.");
  return parsed.data.profiles;
}

/** Read deliveries for one allowlisted repository. */
export async function listWorkflowDeliveries(repository: string): Promise<WorkflowDeliveriesResponse> {
  const query = new URLSearchParams({ repository });
  const result = await request<unknown>(`/deliveries?${query}`);
  const parsed = z.object({ schemaVersion: z.literal(1), deliveries: z.array(deliverySchema), lastReconciledAt: z.string().nullable() }).safeParse(result);
  if (!parsed.success) throw new Error("Workflow bridge returned an unsupported deliveries response.");
  return parsed.data as WorkflowDeliveriesResponse;
}

/** Simulate a profile against the bridge's live provider and Plane mappings. */
export async function simulateWorkflowProfile(profile: WorkflowProfile): Promise<WorkflowSimulation> {
  const result = await request<unknown>("/profiles/simulate", {
    method: "POST",
    body: JSON.stringify({ profile }),
  });
  const parsed = simulationSchema.safeParse(result);
  if (!parsed.success) throw new Error("Workflow bridge returned an unsupported simulation response.");
  return parsed.data as WorkflowSimulation;
}

/** Ask the single bridge writer to reconcile independently retrieved source evidence. */
export async function reconcileWorkflow(input: {
  repository: string;
  workItems?: string[];
  promotionRunId?: number;
  pullRequest?: number;
  apply?: boolean;
}): Promise<{ schemaVersion: 1; mode: "observe" | "full"; deliveries: WorkflowDelivery[] }> {
  // Reconciliation is an explicit operator action even when the selected bridge profile is observe-only.
  const result = await request<unknown>("/reconcile", { method: "POST", body: JSON.stringify(input) }, true);
  const parsed = z.object({ schemaVersion: z.literal(1), mode: z.enum(["observe", "full"]), deliveries: z.array(deliverySchema) }).strict().safeParse(result);
  if (!parsed.success) {
    throw new Error("Workflow bridge returned an unsupported reconciliation response.");
  }
  return parsed.data as { schemaVersion: 1; mode: "observe" | "full"; deliveries: WorkflowDelivery[] };
}
