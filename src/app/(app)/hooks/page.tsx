import { HooksTable, type HookRow } from "@/components/hooks-table";
import { requireUser } from "@/server/auth/require";
import { prisma } from "@/server/db";
import { isAcknowledged } from "@/server/github/hooks";

export const dynamic = "force-dynamic";

type Counts = { match: number; outdated: number; missing: number; extra: number; confirmed: number };

/** Cross-repo agent-hook drift overview: per repo, how its .claude/.codex files compare to the
 *  canonical template (matched / outdated / missing / extra). */
export default async function HooksPage() {
  await requireUser();
  const states = await prisma.repoHookState.findMany({
    include: { repo: { select: { id: true, nameWithOwner: true } } },
  });

  const byRepo = new Map<string, { repo: string; counts: Counts }>();
  for (const state of states) {
    const entry = byRepo.get(state.repo.id) ?? {
      repo: state.repo.nameWithOwner,
      counts: { match: 0, outdated: 0, missing: 0, extra: 0, confirmed: 0 },
    };
    if (state.status in entry.counts) entry.counts[state.status as keyof Counts] += 1;
    if ((state.status === "outdated" || state.status === "missing") && isAcknowledged(state)) {
      entry.counts.confirmed += 1;
    }
    byRepo.set(state.repo.id, entry);
  }

  const rows: HookRow[] = [...byRepo.entries()]
    .map(([id, { repo, counts }]) => ({
      id,
      repo,
      // Drift = an UNCONFIRMED sync gap (outdated/missing minus confirmed customizations). `extra`
      // files are repo-specific additions the template doesn't carry — surfaced but not drift.
      status: counts.outdated + counts.missing - counts.confirmed === 0 ? "in sync" : "drift",
      ...counts,
    }))
    .sort((a, b) => a.repo.localeCompare(b.repo));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Agent hooks</h1>
        <p className="text-sm text-muted-foreground">
          Drift of each repo&apos;s <code>.claude/</code> and <code>.codex/</code> files vs the
          canonical template, compared by git blob SHA.
        </p>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nothing synced yet — set <code>ORCHID_TEMPLATE_REPO</code>, then open the Dashboard and
          click <strong>Refresh data</strong>.
        </p>
      ) : (
        <HooksTable rows={rows} />
      )}
    </div>
  );
}
