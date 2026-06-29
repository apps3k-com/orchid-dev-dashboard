"use client";

import { useActionState, useId } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { requestAudit, type AuditRequestState } from "@/app/(app)/repos/[id]/audit/actions";

const INITIAL: AuditRequestState = { ok: false, message: "" };

/** Queue an audit: a consent checkbox (config is sent to the provider) + the run button. */
export function AuditRunForm({ repoId, model }: { repoId: string; model: string }) {
  const [state, action, pending] = useActionState(requestAudit, INITIAL);
  const consentId = useId();

  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="repoId" value={repoId} />

      <div className="flex items-start gap-2">
        <Checkbox id={consentId} name="consent" required />
        <Label htmlFor={consentId} className="text-sm font-normal text-muted-foreground">
          I understand this sends the repo&apos;s agent/hook config files to the provider ({model})
          for review.
        </Label>
      </div>

      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Queuing…" : "Run audit"}
        </Button>
      </div>

      {/* Always-present live region; colored only once there is a message. */}
      <p
        role="status"
        aria-live="polite"
        className={`text-sm ${!state.message ? "" : state.ok ? "text-muted-foreground" : "text-destructive"}`}
      >
        {state.message}
      </p>
    </form>
  );
}
