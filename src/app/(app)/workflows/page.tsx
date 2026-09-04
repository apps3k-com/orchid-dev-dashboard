import { WorkflowControlPanel, type WorkflowSnapshot } from "@/components/workflow-control-panel";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/server/auth/require";
import { isWorkflowAdmin } from "@/server/workflows/admin";
import { listWorkflowDeliveries, listWorkflowProfiles } from "@/server/workflows/client";

export const dynamic = "force-dynamic";

async function loadSnapshots(): Promise<{ snapshots: WorkflowSnapshot[]; error: string | null }> {
  try {
    const profiles = await listWorkflowProfiles();
    const snapshots: WorkflowSnapshot[] = await Promise.all(profiles.map(async (profile) => {
      try {
        const result = await listWorkflowDeliveries(profile.repository);
        return { profile, deliveries: result.deliveries, lastReconciledAt: result.lastReconciledAt, error: null };
      } catch (error) {
        return { profile, deliveries: [], lastReconciledAt: null, error: error instanceof Error ? error.message : "Bridge request failed." };
      }
    }));
    return { snapshots, error: null };
  } catch (error) {
    return { snapshots: [], error: error instanceof Error ? error.message : "Bridge request failed." };
  }
}

/** Workflow observability and configuration surface. The bridge remains the only evaluator and writer. */
export default async function WorkflowsPage() {
  const user = await requireUser();
  if (!isWorkflowAdmin(user.login)) {
    return (
      <Card>
        <CardHeader><CardTitle>Workflow control</CardTitle><CardDescription>Access is restricted to configured workflow administrators.</CardDescription></CardHeader>
        <CardContent><p className="text-sm text-muted-foreground">Ask an operator to add your GitHub login to `ORCHID_WORKFLOW_ADMINS`.</p></CardContent>
      </Card>
    );
  }
  const { snapshots, error } = await loadSnapshots();
  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-semibold tracking-tight">Workflow control</h1><p className="text-sm text-muted-foreground">Evidence, reconciliation and configuration proposals for the single GitHub-to-Plane bridge writer.</p></div>
      {error ? <Card><CardContent className="p-6 text-sm text-destructive">Could not read workflow profiles: {error}</CardContent></Card> : snapshots.length === 0 ? <Card><CardContent className="p-6 text-sm text-muted-foreground">The bridge returned no configured workflow profiles.</CardContent></Card> : <WorkflowControlPanel snapshots={snapshots} />}
    </div>
  );
}
