import type {
  WorkflowDeliveriesResponse,
  WorkflowDelivery,
  WorkflowProfile,
  WorkflowSimulation,
} from "./types";

type BridgeErrorBody = { error?: unknown };

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
  const result = await request<{ schemaVersion: number; profiles: WorkflowProfile[] }>("/profiles");
  if (result.schemaVersion !== 1 || !Array.isArray(result.profiles)) throw new Error("Workflow bridge returned an unsupported profiles response.");
  return result.profiles;
}

/** Read deliveries for one allowlisted repository. */
export async function listWorkflowDeliveries(repository: string): Promise<WorkflowDeliveriesResponse> {
  const query = new URLSearchParams({ repository });
  const result = await request<WorkflowDeliveriesResponse>(`/deliveries?${query}`);
  if (result.schemaVersion !== 1 || !Array.isArray(result.deliveries)) throw new Error("Workflow bridge returned an unsupported deliveries response.");
  return result;
}

/** Simulate a profile against the bridge's live provider and Plane mappings. */
export async function simulateWorkflowProfile(profile: WorkflowProfile): Promise<WorkflowSimulation> {
  return request<WorkflowSimulation>("/profiles/simulate", {
    method: "POST",
    body: JSON.stringify({ profile }),
  });
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
  if (!result || typeof result !== "object" ||
      (result as { schemaVersion?: unknown }).schemaVersion !== 1 ||
      !["observe", "full"].includes(String((result as { mode?: unknown }).mode)) ||
      !Array.isArray((result as { deliveries?: unknown }).deliveries)) {
    throw new Error("Workflow bridge returned an unsupported reconciliation response.");
  }
  return result as { schemaVersion: 1; mode: "observe" | "full"; deliveries: WorkflowDelivery[] };
}
