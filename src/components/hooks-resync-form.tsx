"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { resyncRepoHooks, type ResyncState } from "@/app/(app)/hooks/[id]/actions";

const INITIAL: ResyncState = { ok: false, message: "" };

/** Open a PR that re-syncs a repo's drifted agent-hook files to the canonical template. */
export function HooksResyncForm({ repoId, driftCount }: { repoId: string; driftCount: number }) {
  const [state, action, pending] = useActionState(resyncRepoHooks, INITIAL);

  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="repoId" value={repoId} />
      <div>
        <Button type="submit" disabled={pending}>
          {pending
            ? "Opening PR…"
            : `Re-sync ${driftCount} file${driftCount === 1 ? "" : "s"} (open PR)`}
        </Button>
      </div>

      {/* Always-present live region (kept in the DOM so screen readers announce the result after
          submit); colored only once there is a message, so the idle state isn't styled as an error. */}
      <p
        role="status"
        aria-live="polite"
        className={`text-sm ${!state.message ? "" : state.ok ? "text-muted-foreground" : "text-destructive"}`}
      >
        {state.message}{" "}
        {state.ok && state.prUrl ? (
          <a href={state.prUrl} target="_blank" rel="noreferrer" className="font-medium underline">
            View pull request<span className="sr-only"> (opens in a new tab)</span>
          </a>
        ) : null}
      </p>
    </form>
  );
}
