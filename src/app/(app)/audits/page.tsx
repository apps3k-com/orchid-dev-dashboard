import { ClipboardCheckIcon, FolderGit2Icon, ShieldAlertIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import StatisticsCard from "@/components/shadcn-studio/blocks/statistics-card-03";
import EmptyState from "@/components/shadcn-studio/blocks/empty-state-02/empty-state-02";
import { AuditsTable, type AuditRow } from "./audits-table";
import { summarizeFleet } from "@/server/llm/audit-batch";
import { prisma } from "@/server/db";

export const dynamic = "force-dynamic";

const SEVERITY_ORDER = ["critical", "high", "medium", "low", "info"];

/** Fleet-wide audit overview: the latest audit per repo (score, status, findings, last run, cost),
 *  incl. never-audited repos, with summary KPIs. Findings here are filtered to `state: "open"` so
 *  the "Open findings" KPI, `worstSeverity`, and each row's `findingCount` agree; batch selection
 *  (row checkboxes + consent) and estimate/confirm/run are handled by {@link AuditsTable}. */
export default async function AuditsPage() {
  const repos = await prisma.repo.findMany({
    where: { isArchived: false },
    orderBy: { nameWithOwner: "asc" },
    include: {
      audits: {
        orderBy: { createdAt: "desc" },
        take: 1,
        include: { findings: { where: { state: "open" }, select: { severity: true } } },
      },
    },
  });

  const rows: AuditRow[] = repos.map((repo) => {
    const audit = repo.audits[0] ?? null;
    const severities = audit?.findings.map((f) => f.severity) ?? [];
    const worstSeverity = SEVERITY_ORDER.find((s) => severities.includes(s)) ?? null;
    return {
      id: repo.id,
      nameWithOwner: repo.nameWithOwner,
      auditHref: `/repos/${repo.id}/audit`,
      status: audit?.status ?? "none",
      score: audit?.score ?? null,
      worstSeverity,
      findingCount: audit?.findings.length ?? 0,
      lastRun: audit ? audit.createdAt.toISOString() : null,
      usd: audit?.estimatedUsd ? Number(audit.estimatedUsd) : null,
    };
  });

  const summary = summarizeFleet(
    rows.map((r) => ({
      hasAudit: r.status !== "none",
      score: r.score,
      status: r.status,
      findingCount: r.findingCount,
    })),
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Audits</h1>
        <p className="text-sm text-muted-foreground">Fleet-wide LLM config-health overview.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatisticsCard
          icon={<FolderGit2Icon />}
          value={`${summary.auditedRepos}/${summary.totalRepos}`}
          title="Repos audited"
        />
        <StatisticsCard
          icon={<ClipboardCheckIcon />}
          value={summary.averageScore == null ? "—" : `${summary.averageScore}/100`}
          title="Average score"
        />
        <StatisticsCard
          icon={<ShieldAlertIcon />}
          value={String(summary.openFindings)}
          title="Open findings"
        />
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="No audits yet"
          description="This fleet has no cached audit data."
          message="Nothing cached yet"
          hint="Open the Dashboard and click Refresh data to sync repos, then run an audit."
          action={
            <Button asChild size="sm">
              <a href="/dashboard">Go to Dashboard</a>
            </Button>
          }
        />
      ) : (
        <AuditsTable rows={rows} />
      )}
    </div>
  );
}
