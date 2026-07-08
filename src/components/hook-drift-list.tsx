"use client";

import { useState, useTransition } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  acknowledgeHookDrift,
  getHookDiff,
  unacknowledgeHookDrift,
  type HookDiffResult,
} from "@/app/(app)/hooks/[id]/actions";
import { lineDiff } from "@/lib/line-diff";

/** One drifted hook file, with whether its drift has been confirmed as a repo customization. */
export type HookDriftFile = { path: string; status: string; acknowledged: boolean };

/** List of drifted hook files, each with an on-demand template-vs-repo diff and a confirm toggle. */
export function HookDriftList({ repoId, files }: { repoId: string; files: HookDriftFile[] }) {
  return (
    <ul className="flex flex-col gap-2">
      {files.map((file) => (
        <HookDriftItem key={file.path} repoId={repoId} file={file} />
      ))}
    </ul>
  );
}

/** A single drifted file: status + path, a lazily-loaded diff, and a confirm/unconfirm button. */
function HookDriftItem({ repoId, file }: { repoId: string; file: HookDriftFile }) {
  const [diff, setDiff] = useState<HookDiffResult>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [ackPending, startTransition] = useTransition();

  const toggleDiff = () => {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    if (!diff && !loading) {
      setLoading(true);
      getHookDiff(repoId, file.path)
        .then(setDiff)
        .finally(() => setLoading(false));
    }
  };

  const toggleAck = () =>
    startTransition(async () => {
      if (file.acknowledged) await unacknowledgeHookDrift(repoId, file.path);
      else await acknowledgeHookDrift(repoId, file.path);
      // The actions revalidate /hooks/[id], so the server page re-renders this list with the new state.
    });

  return (
    <li className="rounded-md border">
      <div className="flex flex-wrap items-center gap-2 p-3">
        <Badge variant={file.acknowledged ? "outline" : "destructive"}>{file.status}</Badge>
        {file.acknowledged ? <Badge variant="secondary">confirmed</Badge> : null}
        <code className="text-xs">{file.path}</code>
        <div className="ml-auto flex items-center gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={toggleDiff}>
            {open ? "Hide diff" : "View diff"}
          </Button>
          <Button
            type="button"
            variant={file.acknowledged ? "ghost" : "outline"}
            size="sm"
            disabled={ackPending}
            onClick={toggleAck}
          >
            {file.acknowledged ? "Unconfirm" : "Confirm customization"}
          </Button>
        </div>
      </div>
      {open ? (
        <div className="border-t p-3">
          {loading ? (
            <p className="text-xs text-muted-foreground">Loading diff…</p>
          ) : !diff ? (
            <p className="text-xs text-muted-foreground">Couldn&rsquo;t load the diff.</p>
          ) : (
            <DiffView templateText={diff.templateText} repoText={diff.repoText} />
          )}
        </div>
      ) : null}
    </li>
  );
}

/** Render a template→repo line diff (− template · + this repo). */
function DiffView({ templateText, repoText }: { templateText: string; repoText: string }) {
  const lines = lineDiff(templateText, repoText);
  return (
    <>
      <pre className="max-h-96 overflow-auto rounded bg-muted/40 p-3 text-xs leading-relaxed">
        {lines.map((line, i) => (
          <div
            key={i}
            className={
              line.type === "add"
                ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                : line.type === "remove"
                  ? "bg-destructive/15 text-destructive"
                  : ""
            }
          >
            <span className="select-none opacity-60">
              {line.type === "add" ? "+ " : line.type === "remove" ? "- " : "  "}
            </span>
            {line.text || " "}
          </div>
        ))}
      </pre>
      <p className="mt-1 text-[10px] text-muted-foreground">− canonical template · + this repo</p>
    </>
  );
}
