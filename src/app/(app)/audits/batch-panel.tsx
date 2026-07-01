"use client";

import { useEffect, useRef, useState, useTransition } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { statusVariant } from "@/lib/audit-ui";

import { cancelBatch, confirmBatch, getBatchState, type BatchView } from "./actions";

const POLL_INTERVAL_MS = 2000;

/** Statuses for which the panel keeps polling `getBatchState`; every other status is terminal. */
const POLLING_STATUSES = new Set(["estimating", "running"]);

/** Human label + destructive flag for a batch item's estimate-phase decision. */
function decisionLabel(decision: string): { label: string; destructive: boolean } {
  switch (decision) {
    case "will_audit":
      return { label: "Will audit", destructive: false };
    case "skip_unchanged":
      return { label: "Skip (unchanged)", destructive: false };
    case "skip_no_config":
      return { label: "Skip (no config)", destructive: false };
    case "error":
      return { label: "Error", destructive: true };
    default:
      return { label: decision, destructive: false };
  }
}

/**
 * Modal panel that drives a Fleet-Audit batch through its estimate → confirm → run lifecycle.
 *
 * Polls {@link getBatchState} on mount and every 2s while the batch is `estimating` or `running`,
 * rendering a cost breakdown to confirm or cancel, then live per-repo progress once running.
 * The dialog is open for as long as this component is mounted; closing it (or finishing) calls
 * `onDone` so the parent can unmount the panel.
 */
export function BatchPanel({ batchId, onDone }: { batchId: string; onDone: () => void }) {
  const [view, setView] = useState<BatchView | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [pending, startTransition] = useTransition();
  const shouldPoll = !loaded || (view != null && POLLING_STATUSES.has(view.status));
  // Mirrored into a ref (updated in an effect, never during render) so the interval closure below
  // always reads the latest value without needing to tear down/recreate the timer on every tick.
  const shouldPollRef = useRef(shouldPoll);
  useEffect(() => {
    shouldPollRef.current = shouldPoll;
  }, [shouldPoll]);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      const next = await getBatchState(batchId);
      if (!alive) return;
      setView(next);
      setLoaded(true);
    };
    void tick();
    const timer = setInterval(() => {
      if (shouldPollRef.current) void tick();
    }, POLL_INTERVAL_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [batchId]);

  const handleConfirm = () => {
    startTransition(async () => {
      await confirmBatch(batchId);
    });
  };

  const handleCancel = () => {
    startTransition(async () => {
      await cancelBatch(batchId);
      onDone();
    });
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) onDone();
  };

  return (
    <Dialog open onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Fleet-Audit batch</DialogTitle>
        </DialogHeader>

        {!loaded || view?.status === "estimating" ? (
          <div className="space-y-3">
            <Alert>
              <AlertTitle>Estimating cost…</AlertTitle>
              <AlertDescription>Checking each repository for changes since its last audit.</AlertDescription>
            </Alert>
            <div className="space-y-2">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
          </div>
        ) : !view ? (
          <>
            <Alert variant="destructive">
              <AlertTitle>Batch not found</AlertTitle>
              <AlertDescription>This batch no longer exists.</AlertDescription>
            </Alert>
            <DialogFooter>
              <Button onClick={onDone}>Close</Button>
            </DialogFooter>
          </>
        ) : view.status === "estimated" ? (
          <>
            <div className="max-h-96 overflow-y-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Repository</TableHead>
                    <TableHead>Decision</TableHead>
                    <TableHead className="text-right">Est. cost</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {view.items.map((item) => {
                    const { label, destructive } = decisionLabel(item.decision);
                    return (
                      <TableRow key={item.repoId}>
                        <TableCell className="font-medium">{item.nameWithOwner}</TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1">
                            <Badge variant={destructive ? "destructive" : "outline"}>{label}</Badge>
                            {item.decision === "error" && item.error ? (
                              <span className="text-xs text-destructive">{item.error}</span>
                            ) : item.decision === "skip_unchanged" || item.decision === "skip_no_config" ? (
                              <span className="text-xs text-muted-foreground">
                                {item.decision === "skip_unchanged"
                                  ? "No changes since the last audit."
                                  : "No audit config in this repo."}
                              </span>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          {item.estimatedUsd == null ? "—" : `$${item.estimatedUsd.toFixed(2)}`}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                {view.auditCount ?? 0} to audit · {view.skippedCount ?? 0} skipped
              </span>
              <span className="font-medium">Total: ${(view.totalEstimatedUsd ?? 0).toFixed(2)}</span>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={handleCancel} disabled={pending}>
                Cancel
              </Button>
              <Button
                onClick={handleConfirm}
                disabled={pending || (view.auditCount ?? 0) === 0}
              >
                Confirm &amp; run {view.auditCount ?? 0} (${(view.totalEstimatedUsd ?? 0).toFixed(2)})
              </Button>
            </DialogFooter>
          </>
        ) : view.status === "running" ? (
          <div className="space-y-3">
            <Alert>
              <AlertTitle>Running audits…</AlertTitle>
              <AlertDescription>
                {view.progress.completed + view.progress.failed}/{view.progress.total} finished
              </AlertDescription>
            </Alert>
            <div className="max-h-96 overflow-y-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Repository</TableHead>
                    <TableHead className="text-right">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {view.items
                    .filter((item) => item.decision === "will_audit")
                    .map((item) => (
                      <TableRow key={item.repoId}>
                        <TableCell className="font-medium">{item.nameWithOwner}</TableCell>
                        <TableCell className="text-right">
                          <Badge variant={statusVariant(item.auditStatus ?? "pending")}>
                            {item.auditStatus ?? "pending"}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </div>
          </div>
        ) : view.status === "completed" ? (
          <>
            <Alert>
              <AlertTitle>Batch complete</AlertTitle>
              <AlertDescription>
                {view.progress.completed} succeeded · {view.progress.failed} failed
                {view.skippedCount ? ` · ${view.skippedCount} skipped` : ""}
              </AlertDescription>
            </Alert>
            <DialogFooter>
              <Button onClick={onDone}>Close</Button>
            </DialogFooter>
          </>
        ) : view.status === "cancelled" ? (
          <>
            <Alert>
              <AlertTitle>Batch cancelled</AlertTitle>
              <AlertDescription>No audits were queued.</AlertDescription>
            </Alert>
            <DialogFooter>
              <Button onClick={onDone}>Close</Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <Alert variant="destructive">
              <AlertTitle>Batch failed</AlertTitle>
              <AlertDescription>{view.status === "failed" ? "Could not complete this Fleet-Audit batch. Please try again." : `Unexpected batch status: ${view.status}`}</AlertDescription>
            </Alert>
            <DialogFooter>
              <Button onClick={onDone}>Close</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
