"use client";

import { useActionState, useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { requestAudit, type AuditRequestState } from "@/app/(app)/repos/[id]/audit/actions";

/** Initial inline result state before the first run. */
const INITIAL: AuditRequestState = { ok: false, message: "" };

/** One usable provider key (valid|rate_limited) the run can pick. */
export type AuditKeyOption = { id: string; label: string; isDefault: boolean };

/** Queue an audit: pick which provider key to use (when more than one), confirm consent, and run.
 *  The model is the provider default (set in Settings → AI providers). */
export function AuditRunForm({
  repoId,
  model,
  keys,
}: {
  repoId: string;
  model: string;
  keys: AuditKeyOption[];
}) {
  const [state, action, pending] = useActionState(requestAudit, INITIAL);
  const consentId = useId();
  const keyFieldId = useId();
  const [selectedKey, setSelectedKey] = useState(
    () => (keys.find((k) => k.isDefault) ?? keys[0])?.id ?? "",
  );

  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="repoId" value={repoId} />
      <input type="hidden" name="providerKeyId" value={selectedKey} />

      {keys.length > 1 ? (
        <div className="flex flex-col gap-2">
          <Label htmlFor={keyFieldId}>API key</Label>
          <Select value={selectedKey} onValueChange={setSelectedKey}>
            <SelectTrigger id={keyFieldId} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {keys.map((k) => (
                  <SelectItem key={k.id} value={k.id}>
                    {k.label}
                    {k.isDefault ? " (default)" : ""}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
      ) : null}

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
