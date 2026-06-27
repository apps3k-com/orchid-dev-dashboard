"use client";

import { useActionState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { saveModules, type SaveModulesState } from "@/app/(app)/repos/[id]/modules/actions";

const INITIAL: SaveModulesState = { ok: false, message: "" };

/** Per-repo editor for the module list: shows current modules as badges and submits a
 *  comma-separated list to {@link saveModules}, which opens a pull request. */
export function ModulesForm({ repoId, modules }: { repoId: string; modules: string[] }) {
  const [state, action, pending] = useActionState(saveModules, INITIAL);

  return (
    <form action={action} className="flex flex-col gap-3">
      {modules.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {modules.map((m) => (
            <Badge key={m} variant="secondary">
              {m}
            </Badge>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No modules yet.</p>
      )}
      <input type="hidden" name="repoId" value={repoId} />
      <div className="flex gap-2">
        <Input
          name="modules"
          defaultValue={modules.join(", ")}
          placeholder="auth, billing, picking"
          aria-label="Modules (comma-separated)"
        />
        <Button type="submit" disabled={pending}>
          {pending ? "Opening PR…" : "Propose change"}
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
          <a
            href={state.prUrl}
            target="_blank"
            rel="noreferrer"
            className="font-medium underline"
          >
            View pull request<span className="sr-only"> (opens in a new tab)</span>
          </a>
        ) : null}
      </p>
    </form>
  );
}
