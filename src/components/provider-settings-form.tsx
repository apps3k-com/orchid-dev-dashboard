"use client";

import { useActionState, useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  saveProviderSettingsAction,
  type ProviderActionState,
} from "@/app/(app)/settings/ai-providers/actions";

/** Initial inline result state before the first save. */
const INITIAL: ProviderActionState = { ok: false, message: "" };

/** Choose + save a provider's default model — independent of the keys (item 7). */
export function ProviderSettingsForm({
  provider,
  models,
  defaultModel,
}: {
  provider: string;
  models: string[];
  defaultModel: string;
}) {
  const [state, action, pending] = useActionState(saveProviderSettingsAction, INITIAL);
  const [model, setModel] = useState(defaultModel);
  const modelId = useId();

  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="provider" value={provider} />
      <input type="hidden" name="model" value={model} />
      <div className="flex flex-col gap-2">
        <Label htmlFor={modelId}>Default model</Label>
        <Select value={model} onValueChange={setModel}>
          <SelectTrigger id={modelId} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {models.map((m) => (
                <SelectItem key={m} value={m}>
                  {m}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save settings"}
        </Button>
      </div>
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
