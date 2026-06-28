"use client";

import { useActionState, useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { saveProviderKeyAction, type SaveKeyState } from "@/app/(app)/settings/ai-providers/actions";

/** Initial inline result state before the first save attempt. */
const INITIAL: SaveKeyState = { ok: false, message: "" };

/** Set or replace a provider's API key (default model + key); the action validates before saving. */
export function ProviderKeyForm({
  provider,
  models,
  defaultModel,
  configured,
}: {
  provider: string;
  models: string[];
  defaultModel: string;
  configured: boolean;
}) {
  const [state, action, pending] = useActionState(saveProviderKeyAction, INITIAL);
  const [model, setModel] = useState(defaultModel);
  const modelId = useId();
  const keyId = useId();

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

      <div className="flex flex-col gap-2">
        <Label htmlFor={keyId}>{configured ? "Replace API key" : "API key"}</Label>
        <Input
          id={keyId}
          name="apiKey"
          type="password"
          placeholder="sk-ant-…"
          autoComplete="off"
          required
        />
      </div>

      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Validating…" : configured ? "Replace key" : "Save key"}
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
