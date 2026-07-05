import Link from "next/link";
import { notFound } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { HookDriftList, type HookDriftFile } from "@/components/hook-drift-list";
import { HooksResyncForm } from "@/components/hooks-resync-form";
import { requireUser } from "@/server/auth/require";
import { prisma } from "@/server/db";
import { isAcknowledged } from "@/server/github/hooks";

export const dynamic = "force-dynamic";

const STATUS_VARIANT: Record<string, "secondary" | "destructive" | "outline"> = {
  match: "secondary",
  outdated: "destructive",
  missing: "destructive",
  extra: "outline",
};

/** Per-repo agent-hook detail: each `.claude/.codex` file's drift vs the canonical template, with a
 *  viewable template-vs-repo diff and a confirm-customization toggle (a confirmed file stops counting
 *  as drift until it changes again), plus a one-click re-sync PR for the unconfirmed drift. */
export default async function RepoHooksPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const repo = await prisma.repo.findUnique({
    where: { id },
    include: { hookStates: { orderBy: { path: "asc" } } },
  });
  if (!repo) notFound();

  const drift: HookDriftFile[] = [];
  const other: { id: string; path: string; status: string }[] = [];
  for (const state of repo.hookStates) {
    if (state.status === "outdated" || state.status === "missing") {
      drift.push({ path: state.path, status: state.status, acknowledged: isAcknowledged(state) });
    } else {
      other.push({ id: state.id, path: state.path, status: state.status });
    }
  }
  const unconfirmedDrift = drift.filter((d) => !d.acknowledged).length;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/hooks" className="text-sm text-muted-foreground hover:underline">
          ← Agent hooks
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{repo.nameWithOwner}</h1>
        <p className="text-sm text-muted-foreground">
          Per-file drift of <code>.claude/</code> and <code>.codex/</code> vs the canonical template.
          Confirm a repo-specific customization so it stops counting as drift; re-syncing opens a pull
          request against <code>{repo.defaultBranch}</code>.
        </p>
      </div>

      {repo.hookStates.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No hook drift cached yet — open the Dashboard and click <strong>Refresh data</strong>.
        </p>
      ) : (
        <>
          {drift.length > 0 ? (
            <div className="space-y-2">
              <h2 className="text-sm font-medium">Drift · {unconfirmedDrift} unconfirmed</h2>
              <HookDriftList repoId={repo.id} files={drift} />
            </div>
          ) : null}

          {other.length > 0 ? (
            <div className="space-y-2">
              <h2 className="text-sm font-medium">In sync &amp; repo-only files</h2>
              <ul className="flex flex-col gap-2 text-sm">
                {other.map((state) => (
                  <li key={state.id} className="flex items-center gap-2">
                    <Badge variant={STATUS_VARIANT[state.status] ?? "outline"}>{state.status}</Badge>
                    <code className="text-xs">{state.path}</code>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {unconfirmedDrift > 0 ? (
            <HooksResyncForm repoId={repo.id} driftCount={unconfirmedDrift} />
          ) : (
            <p className="text-sm text-muted-foreground">
              Nothing to re-sync — no unconfirmed outdated or missing files.
            </p>
          )}
        </>
      )}
    </div>
  );
}
