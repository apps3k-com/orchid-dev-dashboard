import Link from "next/link";
import { notFound } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { HooksResyncForm } from "@/components/hooks-resync-form";
import { requireUser } from "@/server/auth/require";
import { prisma } from "@/server/db";

export const dynamic = "force-dynamic";

const STATUS_VARIANT: Record<string, "secondary" | "destructive" | "outline"> = {
  match: "secondary",
  outdated: "destructive",
  missing: "destructive",
  extra: "outline",
};

/** Per-repo agent-hook detail: each .claude/.codex file's drift vs the canonical template, with a
 *  one-click re-sync that opens a PR bringing the outdated/missing files back in line. */
export default async function RepoHooksPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const repo = await prisma.repo.findUnique({
    where: { id },
    include: { hookStates: { orderBy: { path: "asc" } } },
  });
  if (!repo) notFound();

  const driftCount = repo.hookStates.filter(
    (s) => s.status === "outdated" || s.status === "missing",
  ).length;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/hooks" className="text-sm text-muted-foreground hover:underline">
          ← Agent hooks
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{repo.nameWithOwner}</h1>
        <p className="text-sm text-muted-foreground">
          Per-file drift of <code>.claude/</code> and <code>.codex/</code> vs the canonical template.
          Re-syncing opens a pull request against <code>{repo.defaultBranch}</code>.
        </p>
      </div>

      {repo.hookStates.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No hook drift cached yet — open the Dashboard and click <strong>Refresh data</strong>.
        </p>
      ) : (
        <>
          <ul className="flex flex-col gap-2 text-sm">
            {repo.hookStates.map((state) => (
              <li key={state.id} className="flex items-center gap-2">
                <Badge variant={STATUS_VARIANT[state.status] ?? "outline"}>{state.status}</Badge>
                <code>{state.path}</code>
              </li>
            ))}
          </ul>

          {driftCount > 0 ? (
            <HooksResyncForm repoId={repo.id} driftCount={driftCount} />
          ) : (
            <p className="text-sm text-muted-foreground">In sync — nothing to re-sync.</p>
          )}
        </>
      )}
    </div>
  );
}
