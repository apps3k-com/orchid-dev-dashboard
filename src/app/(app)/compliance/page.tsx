import { ComplianceTable, type ComplianceRow } from "@/components/compliance-table";
import { requireUser } from "@/server/auth/require";
import { prisma } from "@/server/db";
import { TIER0_STANDARDS, computeTier, type StandardState } from "@/server/github/standards";

export const dynamic = "force-dynamic";

/** Cross-repo Tier-0 adoption compliance: per repo, how many of the workflow-template baseline
 *  standards are present, and the resulting adoption tier. */
export default async function CompliancePage() {
  await requireUser();
  const states = await prisma.repoStandard.findMany({
    include: { repo: { select: { id: true, nameWithOwner: true } } },
  });

  const byRepo = new Map<string, { repo: string; states: StandardState[] }>();
  for (const s of states) {
    const entry = byRepo.get(s.repo.id) ?? { repo: s.repo.nameWithOwner, states: [] };
    entry.states.push({
      key: s.key as StandardState["key"],
      tier: s.tier,
      label: s.key,
      status: s.status as StandardState["status"],
    });
    byRepo.set(s.repo.id, entry);
  }

  const rows: ComplianceRow[] = [...byRepo.entries()]
    .map(([id, { repo, states }]) => {
      const present = states.filter((x) => x.status === "present").length;
      const tier = computeTier(states);
      return { id, repo, tier: tier === null ? "—" : `Tier ${tier}`, present, missing: states.length - present };
    })
    .sort((a, b) => a.repo.localeCompare(b.repo));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Compliance</h1>
        <p className="text-sm text-muted-foreground">
          Tier-0 adoption of the apps3k workflow-template baseline per repo ({TIER0_STANDARDS.length}{" "}
          standards).
        </p>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nothing synced yet — open the Dashboard and click <strong>Refresh data</strong>.
        </p>
      ) : (
        <ComplianceTable rows={rows} />
      )}
    </div>
  );
}
