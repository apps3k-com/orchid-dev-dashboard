"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { installRecipe, type InstallState } from "@/app/(app)/automations/actions";

const INITIAL: InstallState = { ok: false, message: "" };

type RepoOption = { id: string; nameWithOwner: string };

/** Pick a repo and open a PR that provisions a recipe's workflow (via {@link installRecipe}). */
export function AutomationInstallForm({
  recipeId,
  repos,
}: {
  recipeId: string;
  repos: RepoOption[];
}) {
  const [state, action, pending] = useActionState(installRecipe, INITIAL);
  const [repoId, setRepoId] = useState("");

  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="recipeId" value={recipeId} />
      <input type="hidden" name="repoId" value={repoId} />
      <div className="flex gap-2">
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
        <Button type="submit" disabled={pending || !repoId}>
          {pending ? "Opening PR…" : "Open PR"}
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
