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
import { addModule, type ModuleActionState } from "@/app/(app)/repos/[id]/modules/actions";

/** Initial inline result state before the first submit. */
const INITIAL: ModuleActionState = { ok: false, message: "" };

/** Add a module: a two-column field grid (name · status · description). Saves the description/status
 *  metadata immediately and opens a PR adding the name to `.github/modules.yaml`. */
export function AddModuleForm({ repoId }: { repoId: string }) {
  const [state, action, pending] = useActionState(addModule, INITIAL);
  const [status, setStatus] = useState("active");
  const nameId = useId();
  const statusId = useId();
  const descId = useId();

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="repoId" value={repoId} />
      <input type="hidden" name="status" value={status} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor={nameId}>Module name</Label>
          <Input id={nameId} name="name" placeholder="auth" autoComplete="off" required />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor={statusId}>Status</Label>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger id={statusId} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="active">active</SelectItem>
                <SelectItem value="deprecated">deprecated</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-2 sm:col-span-2">
          <Label htmlFor={descId}>Description</Label>
          <Input
            id={descId}
            name="description"
            placeholder="What this module covers"
            autoComplete="off"
          />
        </div>
      </div>

      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Opening PR…" : "Add module"}
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
            View pull request<span className="sr-only"> (opens in a new tab)</span>
          </a>
        ) : null}
      </p>
    </form>
  );
}
