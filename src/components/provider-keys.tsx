"use client";

import { useActionState, useId, useState, useTransition } from "react";

import { Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  addProviderKeyAction,
  removeProviderKeyAction,
  replaceProviderKeyAction,
  setDefaultProviderKeyAction,
  type ProviderActionState,
} from "@/app/(app)/settings/ai-providers/actions";
import type { ProviderKeyView } from "@/server/llm/keys";

/** Initial inline result state before the first action. */
const INITIAL: ProviderActionState = { ok: false, message: "" };

/** Badge variants for a key's validation status. */
const STATUS_VARIANT: Record<string, "secondary" | "destructive" | "outline"> = {
  valid: "secondary",
  invalid: "destructive",
  rate_limited: "outline",
  unchecked: "outline",
};

/** Manage a provider's keys: list them (status + default marker), add, replace, remove, set default.
 *  Multiple keys per provider (item 8); one is the default used by audits unless overridden. */
export function ProviderKeys({ provider, keys }: { provider: string; keys: ProviderKeyView[] }) {
  const [addState, addAction, adding] = useActionState(addProviderKeyAction, INITIAL);
  const [pending, startTransition] = useTransition();
  const [rowMsg, setRowMsg] = useState("");
  const [replacingId, setReplacingId] = useState<string | null>(null);
  const labelId = useId();
  const keyFieldId = useId();

  const runIdAction = (fn: (id: string) => Promise<ProviderActionState>, id: string) =>
    startTransition(async () => {
      const res = await fn(id);
      setRowMsg(res.message);
    });

  return (
    <div className="flex flex-col gap-4">
      {keys.length === 0 ? (
        <p className="text-sm text-muted-foreground">No keys yet — add one below.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {keys.map((k) => (
            <li key={k.id} className="flex flex-col gap-2 rounded-md border p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{k.label}</span>
                {k.isDefault ? <Badge variant="secondary">default</Badge> : null}
                <Badge variant={STATUS_VARIANT[k.status] ?? "outline"}>{k.status}</Badge>
                <code className="text-xs text-muted-foreground">{k.maskedHint}</code>
                <div className="ml-auto flex items-center gap-1">
                  {!k.isDefault ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={pending}
                      onClick={() => runIdAction(setDefaultProviderKeyAction, k.id)}
                    >
                      Set default
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setReplacingId((cur) => (cur === k.id ? null : k.id))}
                  >
                    Replace
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={pending}
                    onClick={() => runIdAction(removeProviderKeyAction, k.id)}
                    aria-label={`Remove key ${k.label}`}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>
              {replacingId === k.id ? <ReplaceKeyForm keyId={k.id} /> : null}
            </li>
          ))}
        </ul>
      )}
      {rowMsg ? (
        <p role="status" aria-live="polite" className="text-sm text-muted-foreground">
          {rowMsg}
        </p>
      ) : null}

      <form action={addAction} className="flex flex-col gap-2 border-t pt-4">
        <input type="hidden" name="provider" value={provider} />
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="flex flex-1 flex-col gap-1">
            <Label htmlFor={labelId}>Label</Label>
            <Input id={labelId} name="label" placeholder="e.g. team, personal" autoComplete="off" />
          </div>
          <div className="flex flex-col gap-1 sm:flex-[2]">
            <Label htmlFor={keyFieldId}>API key</Label>
            <Input
              id={keyFieldId}
              name="apiKey"
              type="password"
              placeholder="sk-ant-…"
              autoComplete="off"
              required
            />
          </div>
        </div>
        <div>
          <Button type="submit" disabled={adding}>
            {adding ? "Validating…" : "Add key"}
          </Button>
        </div>
        <p
          role="status"
          aria-live="polite"
          className={`text-sm ${!addState.message ? "" : addState.ok ? "text-muted-foreground" : "text-destructive"}`}
        >
          {addState.message}
        </p>
      </form>
    </div>
  );
}

/** Inline "replace this key's secret" form (item 7 — separate from Save settings). */
function ReplaceKeyForm({ keyId }: { keyId: string }) {
  const [state, action, pending] = useActionState(replaceProviderKeyAction, INITIAL);
  const inputId = useId();
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="keyId" value={keyId} />
      <Label htmlFor={inputId} className="sr-only">
        New API key
      </Label>
      <div className="flex gap-2">
        <Input
          id={inputId}
          name="apiKey"
          type="password"
          placeholder="New sk-ant-… key"
          autoComplete="off"
          required
        />
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Validating…" : "Replace"}
        </Button>
      </div>
      {state.message ? (
        <p className={`text-sm ${state.ok ? "text-muted-foreground" : "text-destructive"}`}>
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
