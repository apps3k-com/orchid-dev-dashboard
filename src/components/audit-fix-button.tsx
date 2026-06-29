"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { applyFix, type FixState } from "@/app/(app)/repos/[id]/audit/actions";

const INITIAL: FixState = { ok: false, message: "" };

/** Open (or link to) a PR that applies an auto-fixable finding's proposed file content. */
export function AuditFixButton({
  findingId,
  findingState,
  prUrl,
}: {
  findingId: string;
  findingState: string;
  prUrl: string | null;
}) {
  const [state, action, pending] = useActionState(applyFix, INITIAL);

  // Already applied (persisted) — just link to the PR.
  if (findingState === "pr_opened" && prUrl) {
    return (
      <a href={prUrl} target="_blank" rel="noreferrer" className="text-sm font-medium underline">
        Fix PR opened<span className="sr-only"> (opens in a new tab)</span>
      </a>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-1">
      <input type="hidden" name="findingId" value={findingId} />
      <div>
        <Button type="submit" size="sm" variant="outline" disabled={pending}>
          {pending ? "Opening PR…" : "Open fix PR"}
        </Button>
      </div>
      <p
        role="status"
        aria-live="polite"
        className={`text-sm ${!state.message ? "" : state.ok ? "text-muted-foreground" : "text-destructive"}`}
      >
        {state.message}{" "}
        {state.ok && state.prUrl ? (
          <a href={state.prUrl} target="_blank" rel="noreferrer" className="font-medium underline">
            View PR<span className="sr-only"> (opens in a new tab)</span>
          </a>
        ) : null}
      </p>
    </form>
  );
}
