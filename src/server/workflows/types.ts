/** A configured repository workflow as evaluated by the single bridge writer. */
export type WorkflowProfile = {
  id: string;
  repository: string;
  workspaceSlug: string;
  projectId: string;
  projectIdentifier: string;
  defaultBranch: string;
  mode: "observe" | "full";
  preview: { provider: "coolify"; applicationId: string; urlTemplate: string };
  staging: { workflow: string; artifactPrefix: string };
  states: {
    inProgress: string;
    inReview: string;
    onStaging: string;
    readyForRelease: string;
    done: string;
    cancelled: string;
  };
};

/** One evidence-backed transition decision returned by the bridge. */
export type WorkflowDecision = {
  from: string;
  to: string | null;
  reason: string;
  applied: boolean;
  at: string;
};

/** A work-item delivery read model. Orchid displays it but never evaluates or mutates it. */
export type WorkflowDelivery = {
  repository: string;
  workItem: string;
  workItemId: string;
  title: string;
  currentState: string;
  expectedState: string | null;
  reason: string;
  pullRequest: {
    number: number;
    url: string;
    headSha: string;
    mergeSha: string | null;
    draft: boolean;
    merged: boolean;
  } | null;
  preview: { status: string; sha: string; url: string; deploymentId: string; deploymentUrl?: string | null } | null;
  staging: { status: string; sha: string; releaseTag: string; runId: number; url: string } | null;
  release: { tag: string; sha: string; url: string; publishedAt: string } | null;
  /** Read-only GitHub checks. They inform operators but never gate bridge transitions. */
  checks?: Array<{ name: string; status: string; conclusion: string | null; url: string | null }>;
  decisions: WorkflowDecision[];
  updatedAt: string;
};

/** Successful profile simulation. Its binding is merged by identity into the infra config only via PR. */
export type WorkflowSimulation = {
  valid: boolean;
  errors: string[];
  profile: WorkflowProfile;
  proposedBinding: Record<string, unknown> | null;
  decisions: WorkflowDecision[];
  playbook: string;
};

export type WorkflowDeliveriesResponse = {
  schemaVersion: 1;
  deliveries: WorkflowDelivery[];
  lastReconciledAt: string | null;
};
