"use client";

import { useActionState, useMemo, useState, type ChangeEvent } from "react";
import { Download, ExternalLink, Play, RefreshCw, Send } from "lucide-react";
import { proposeWorkflowProfile, reconcileProfile, simulateProfile, type WorkflowActionState } from "@/app/(app)/workflows/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { WorkflowDelivery, WorkflowProfile } from "@/server/workflows/types";

const INITIAL: WorkflowActionState = { ok: false, message: "" };

export type WorkflowSnapshot = {
  profile: WorkflowProfile;
  deliveries: WorkflowDelivery[];
  lastReconciledAt: string | null;
  error: string | null;
};

type ProfileDraft = WorkflowProfile;

const EMPTY_PROFILE: ProfileDraft = {
  id: "",
  repository: "",
  workspaceSlug: "apps3k",
  projectId: "",
  projectIdentifier: "",
  defaultBranch: "main",
  mode: "observe",
  preview: { provider: "coolify", applicationId: "", urlTemplate: "https://preview.example.invalid/pr/{number}" },
  staging: { workflow: "Promote Published Release Tag to Staging", artifactPrefix: "staging-acceptance-" },
  states: {
    inProgress: "In Progress",
    inReview: "In Review",
    onStaging: "On Staging",
    readyForRelease: "Ready for Release",
    done: "Done",
    cancelled: "Cancelled",
  },
};

function stamp(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? value : date.toLocaleString();
}

function shortSha(value: string | null | undefined): string {
  return value ? value.slice(0, 10) : "—";
}

function evidenceBadge(status: string | undefined): "secondary" | "outline" | "destructive" {
  if (!status) return "outline";
  if (/success|finished|published|accepted/i.test(status)) return "secondary";
  if (/fail|error|missing/i.test(status)) return "destructive";
  return "outline";
}

/** Compact delivery read model. Evidence comes exclusively from the bridge; empty stays visibly empty. */
function DeliveryTable({ deliveries }: { deliveries: WorkflowDelivery[] }) {
  if (deliveries.length === 0) {
    return <p className="text-sm text-muted-foreground">No deliveries have been reconciled for this profile.</p>;
  }
  return (
    <div className="overflow-x-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Work item</TableHead>
            <TableHead>Current → expected</TableHead>
            <TableHead>PR delivery</TableHead>
            <TableHead>Preview</TableHead>
            <TableHead>Staging</TableHead>
            <TableHead>Release</TableHead>
            <TableHead>Reason</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {deliveries.map((delivery) => (
            <TableRow key={delivery.workItemId}>
              <TableCell>
                <p className="font-medium">{delivery.workItem}</p>
                <p className="max-w-48 truncate text-xs text-muted-foreground" title={delivery.title}>{delivery.title}</p>
              </TableCell>
              <TableCell>
                <div className="flex flex-wrap items-center gap-1 text-sm">
                  <Badge variant="outline">{delivery.currentState}</Badge>
                  <span className="text-muted-foreground">→</span>
                  {delivery.expectedState ? <Badge variant="secondary">{delivery.expectedState}</Badge> : <span>—</span>}
                </div>
              </TableCell>
              <TableCell>
                {delivery.pullRequest ? (
                  <div className="space-y-1 text-xs">
                    <a className="flex items-center gap-1 font-medium underline" href={delivery.pullRequest.url} target="_blank" rel="noreferrer">
                      #{delivery.pullRequest.number}<ExternalLink className="size-3" />
                    </a>
                    <p>head {shortSha(delivery.pullRequest.headSha)}</p>
                    <p>merge {shortSha(delivery.pullRequest.mergeSha)}</p>
                    <Badge variant={delivery.pullRequest.draft ? "outline" : "secondary"}>{delivery.pullRequest.draft ? "draft" : delivery.pullRequest.merged ? "merged" : "open"}</Badge>
                  </div>
                ) : "—"}
              </TableCell>
              <TableCell>
                {delivery.preview ? (
                  <div className="space-y-1 text-xs">
                    <Badge variant={evidenceBadge(delivery.preview.status)}>{delivery.preview.status}</Badge>
                    <p>{shortSha(delivery.preview.sha)}</p>
                    <a className="underline" href={delivery.preview.url} target="_blank" rel="noreferrer">deployment {delivery.preview.deploymentId}</a>
                  </div>
                ) : "—"}
              </TableCell>
              <TableCell>
                {delivery.staging ? (
                  <div className="space-y-1 text-xs">
                    <Badge variant={evidenceBadge(delivery.staging.status)}>{delivery.staging.status}</Badge>
                    <p>{delivery.staging.releaseTag} · {shortSha(delivery.staging.sha)}</p>
                    <a className="underline" href={delivery.staging.url} target="_blank" rel="noreferrer">run {delivery.staging.runId}</a>
                  </div>
                ) : "—"}
              </TableCell>
              <TableCell>
                {delivery.release ? (
                  <div className="space-y-1 text-xs">
                    <a className="font-medium underline" href={delivery.release.url} target="_blank" rel="noreferrer">{delivery.release.tag}</a>
                    <p>{shortSha(delivery.release.sha)}</p>
                    <p>{stamp(delivery.release.publishedAt)}</p>
                  </div>
                ) : "—"}
              </TableCell>
              <TableCell>
                <p className="max-w-64 text-xs">{delivery.reason}</p>
                {delivery.decisions.length ? <DecisionList decisions={delivery.decisions} /> : null}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function DecisionList({ decisions }: { decisions: WorkflowDelivery["decisions"] }) {
  return (
    <details className="mt-2 text-xs text-muted-foreground">
      <summary className="cursor-pointer">{decisions.length} decision{decisions.length === 1 ? "" : "s"}</summary>
      <ul className="mt-1 space-y-1">
        {decisions.map((decision, index) => (
          <li key={`${decision.at}-${index}`}>{decision.from} → {decision.to ?? "no transition"}: {decision.reason}</li>
        ))}
      </ul>
    </details>
  );
}

/** Explicit bridge reconciliation control. The server action keeps both tokens out of the browser. */
function ReconcilePanel({ repository }: { repository: string }) {
  const [state, action, pending] = useActionState(reconcileProfile, INITIAL);
  const [apply, setApply] = useState(false);
  return (
    <form action={action} className="flex flex-wrap items-end gap-3 rounded-md border bg-muted/30 p-3">
      <input type="hidden" name="repository" value={repository} />
      <input type="hidden" name="apply" value={apply ? "true" : "false"} />
      <div className="grid gap-2">
        <Label htmlFor={`pr-${repository}`}>PR hint (optional)</Label>
        <Input id={`pr-${repository}`} name="pullRequest" inputMode="numeric" placeholder="1545" className="w-28" />
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`run-${repository}`}>Promotion run (optional)</Label>
        <Input id={`run-${repository}`} name="promotionRunId" inputMode="numeric" placeholder="33728716260" className="w-40" />
      </div>
      <label className="flex items-center gap-2 pb-2 text-sm">
        <input type="checkbox" checked={apply} onChange={(event) => setApply(event.target.checked)} />
        Apply if bridge full mode permits it
      </label>
      <Button type="submit" size="sm" disabled={pending}>
        <RefreshCw className="size-4" />{pending ? "Reconciling…" : "Reconcile"}
      </Button>
      {state.message ? <p role="status" className={`basis-full text-sm ${state.ok ? "text-muted-foreground" : "text-destructive"}`}>{state.message}</p> : null}
      {state.deliveries ? <div className="basis-full"><DeliveryTable deliveries={state.deliveries} /></div> : null}
    </form>
  );
}

function setDraftValue(draft: ProfileDraft, path: string, value: string): ProfileDraft {
  if (path.startsWith("preview.")) {
    const key = path.slice(8) as "applicationId" | "urlTemplate";
    return { ...draft, preview: { ...draft.preview, [key]: value } };
  }
  if (path.startsWith("staging.")) {
    const key = path.slice(8) as keyof ProfileDraft["staging"];
    return { ...draft, staging: { ...draft.staging, [key]: value } };
  }
  if (path.startsWith("states.")) {
    const key = path.slice(7) as keyof ProfileDraft["states"];
    return { ...draft, states: { ...draft.states, [key]: value } };
  }
  return { ...draft, [path]: value };
}

/** Parameterized profile simulation and safe configuration-PR proposal. */
function ProfileEditor() {
  const [draft, setDraft] = useState<ProfileDraft>(EMPTY_PROFILE);
  const [simulationState, simulationAction, simulationPending] = useActionState(simulateProfile, INITIAL);
  const [proposalState, proposalAction, proposalPending] = useActionState(proposeWorkflowProfile, INITIAL);
  const encoded = useMemo(() => JSON.stringify(draft), [draft]);
  const simulation = simulationState.simulation;
  const update = (path: string) => (event: ChangeEvent<HTMLInputElement>) => setDraft((current) => setDraftValue(current, path, event.target.value));

  const downloadPlaybook = () => {
    if (!simulation?.playbook) return;
    const href = URL.createObjectURL(new Blob([simulation.playbook], { type: "text/markdown;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = href;
    anchor.download = `${simulation.profile.repository.replace("/", "-")}-workflow-playbook.md`;
    anchor.click();
    URL.revokeObjectURL(href);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Profile simulator</CardTitle>
        <CardDescription>Validate provider, Plane and state mappings with the bridge before opening a configuration PR.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <form action={simulationAction} className="grid gap-4 md:grid-cols-2">
          <input type="hidden" name="profile" value={encoded} />
          {([
            ["id", "Profile ID", "vm3k"], ["repository", "Repository", "apps3k-com/Venuemaster3000"],
            ["workspaceSlug", "Plane workspace", "apps3k"], ["projectId", "Plane project ID", "UUID"],
            ["projectIdentifier", "Plane identifier", "VM3K"], ["defaultBranch", "Default branch", "main"],
            ["preview.applicationId", "Coolify application ID", "j389rmnj9pxyu4fem8cwflex"], ["preview.urlTemplate", "Preview URL template", "https://preview.example/pr/{number}"],
            ["staging.workflow", "Staging workflow", "Promote Published Release Tag to Staging"], ["staging.artifactPrefix", "Staging artifact prefix", "staging-acceptance-"],
            ["states.inProgress", "In Progress state", "In Progress"], ["states.inReview", "In Review state", "In Review"],
            ["states.onStaging", "On Staging state", "On Staging"], ["states.readyForRelease", "Ready for Release state", "Ready for Release"],
            ["states.done", "Done state", "Done"], ["states.cancelled", "Cancelled state", "Cancelled"],
          ] as const).map(([path, label, placeholder]) => (
            <div key={path} className="grid gap-2">
              <Label htmlFor={`workflow-${path}`}>{label}</Label>
              <Input id={`workflow-${path}`} value={path.startsWith("preview.") ? draft.preview[path.slice(8) as keyof typeof draft.preview] : path.startsWith("staging.") ? draft.staging[path.slice(8) as keyof typeof draft.staging] : path.startsWith("states.") ? draft.states[path.slice(7) as keyof typeof draft.states] : draft[path as keyof ProfileDraft] as string} onChange={update(path)} placeholder={placeholder} required />
            </div>
          ))}
          <div className="grid gap-2">
            <Label htmlFor="workflow-mode">Bridge mode</Label>
            <Select value={draft.mode} onValueChange={(value) => setDraft((current) => ({ ...current, mode: value as WorkflowProfile["mode"] }))}>
              <SelectTrigger id="workflow-mode"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="observe">observe</SelectItem><SelectItem value="full">full</SelectItem></SelectContent>
            </Select>
          </div>
          <div className="md:col-span-2"><Button type="submit" disabled={simulationPending}><Play className="size-4" />{simulationPending ? "Simulating…" : "Simulate live profile"}</Button></div>
        </form>
        {simulationState.message ? <p role="status" className={`text-sm ${simulationState.ok ? "text-muted-foreground" : "text-destructive"}`}>{simulationState.message}</p> : null}
        {simulation ? (
          <div className="space-y-3 rounded-md border p-4">
            <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="font-medium">Simulation {simulation.valid ? "passed" : "failed"}</p><p className="text-sm text-muted-foreground">Bridge decisions are shown below; Orchid did not evaluate or write Plane.</p></div><Button type="button" variant="outline" size="sm" onClick={downloadPlaybook}><Download className="size-4" />Download playbook</Button></div>
            {simulation.errors.length ? <ul className="list-disc space-y-1 pl-5 text-sm text-destructive">{simulation.errors.map((error) => <li key={error}>{error}</li>)}</ul> : null}
            {simulation.decisions.length ? <DecisionList decisions={simulation.decisions} /> : <p className="text-sm text-muted-foreground">The bridge returned no decisions.</p>}
            {simulation.valid && simulation.proposedBinding ? (
              <form action={proposalAction} className="flex flex-wrap items-end gap-3 border-t pt-4">
                <input type="hidden" name="profile" value={JSON.stringify(simulation.profile)} />
                <div className="grid gap-2"><Label htmlFor="primary-closing-reference">Primary closing reference</Label><Input id="primary-closing-reference" name="primaryClosingReference" placeholder="Closes A3KCL-123" required /></div>
                <Button type="submit" disabled={proposalPending}><Send className="size-4" />{proposalPending ? "Opening PR…" : "Open configuration PR"}</Button>
                <p className="basis-full text-xs text-muted-foreground">The PR merges only the proposed repository binding and preserves `todoDispatch` and every other binding.</p>
                {proposalState.message ? <p role="status" className={`basis-full text-sm ${proposalState.ok ? "text-muted-foreground" : "text-destructive"}`}>{proposalState.message} {proposalState.prUrl ? <a className="underline" href={proposalState.prUrl} target="_blank" rel="noreferrer">View pull request</a> : null}</p> : null}
              </form>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

/** Full workflow control surface, intentionally displaying only bridge-returned evidence. */
export function WorkflowControlPanel({ snapshots }: { snapshots: WorkflowSnapshot[] }) {
  return (
    <div className="space-y-6">
      {snapshots.map((snapshot) => (
        <Card key={snapshot.profile.id}>
          <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-3"><div><CardTitle>{snapshot.profile.repository}</CardTitle><CardDescription>{snapshot.profile.projectIdentifier} · {snapshot.profile.defaultBranch} · Coolify {snapshot.profile.preview.applicationId}</CardDescription></div><Badge variant={snapshot.profile.mode === "full" ? "secondary" : "outline"}>{snapshot.profile.mode}</Badge></div>
          </CardHeader>
          <CardContent className="space-y-4">
            {snapshot.error ? <p className="text-sm text-destructive">Could not read bridge deliveries: {snapshot.error}</p> : <><p className="text-xs text-muted-foreground">Last reconciled: {stamp(snapshot.lastReconciledAt)}</p><DeliveryTable deliveries={snapshot.deliveries} /></>}
            <Separator />
            <ReconcilePanel repository={snapshot.profile.repository} />
          </CardContent>
        </Card>
      ))}
      <ProfileEditor />
    </div>
  );
}
