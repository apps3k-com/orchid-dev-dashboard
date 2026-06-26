import { ReposTable, type RepoRow } from "@/components/repos-table";
import { prisma } from "@/server/db";

export const dynamic = "force-dynamic";

/** Repository inventory across managed orgs — sortable + filterable, with cached open-PR counts. */
export default async function ReposPage() {
  const repos = await prisma.repo.findMany({
    include: { _count: { select: { pulls: { where: { state: "OPEN" } } } } },
    orderBy: { nameWithOwner: "asc" },
  });

  const rows: RepoRow[] = repos.map((repo) => ({
    id: repo.id,
    nameWithOwner: repo.nameWithOwner,
    url: repo.url ?? `https://github.com/${repo.nameWithOwner}`,
    defaultBranch: repo.defaultBranch,
    visibility: repo.isPrivate ? "private" : "public",
    archived: repo.isArchived,
    openPrs: repo._count.pulls,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Repositories</h1>
        <p className="text-sm text-muted-foreground">
          {repos.length} across all managed organizations.
        </p>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nothing cached yet — open the Dashboard and click <strong>Refresh data</strong>.
        </p>
      ) : (
        <ReposTable rows={rows} />
      )}
    </div>
  );
}
