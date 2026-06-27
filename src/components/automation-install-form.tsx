"use client";

import { useActionState, useState } from "react";

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
import { installRecipe, type InstallState } from "@/app/(app)/automations/actions";
import type { RecipeInput } from "@/server/automations/recipes";

const INITIAL: InstallState = { ok: false, message: "" };

type RepoOption = { id: string; nameWithOwner: string };

/** Pick a repo, fill the recipe's config, and open a PR that provisions + activates it. */
export function AutomationInstallForm({
  recipeId,
  inputs,
  repos,
}: {
  recipeId: string;
  inputs: RecipeInput[];
  repos: RepoOption[];
}) {
  const [state, action, pending] = useActionState(installRecipe, INITIAL);
  const [repoId, setRepoId] = useState("");

  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="recipeId" value={recipeId} />
      <input type="hidden" name="repoId" value={repoId} />

      <div className="flex flex-col gap-2">
        <Label>Repository</Label>
        <Select value={repoId} onValueChange={setRepoId}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Select a repository" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {repos.map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  {r.nameWithOwner}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>

      {inputs.map((input) => (
        <div key={input.name} className="flex flex-col gap-2">
          <Label htmlFor={`input-${input.name}`}>{input.label}</Label>
          <Input
            id={`input-${input.name}`}
            name={`input.${input.name}`}
            placeholder={input.placeholder}
            type={input.type ?? "text"}
            required
          />
          {input.description ? (
            <p className="text-muted-foreground text-xs">{input.description}</p>
          ) : null}
        </div>
      ))}

      <div>
        <Button type="submit" disabled={pending || !repoId}>
          {pending ? "Opening PR…" : "Provision (open PR)"}
        </Button>
      </div>

      {/* Always-present live region so screen readers announce the result after submit. */}
      <p
        role="status"
        aria-live="polite"
        className={`text-sm ${state.ok ? "text-muted-foreground" : "text-destructive"}`}
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
