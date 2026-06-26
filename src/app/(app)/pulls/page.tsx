import { PullsTable, type PullRow } from "@/components/pulls-table";
import { prisma } from "@/server/db";
import { BUCKET_LABEL, prBucket } from "@/server/pulls";

export const dynamic = "force-dynamic";

/** Cross-repo board of open pull requests — sortable + filterable, read from the cache. */
export default async function PullsPage() {
  const prs = await prisma.pullRequest.findMany({
    where: { state: "OPEN" },
    include: { repo: true },
    orderBy: [{ ghUpdatedAt: "desc" }],
  });

  const rows: PullRow[] = prs.map((pr) => ({
    id: pr.id,
    repo: pr.repo.nameWithOwner,
    number: pr.number,
    title: pr.title,
    url: pr.url,
    author: pr.authorLogin ?? "—",
    base: pr.baseRef,
    status: BUCKET_LABEL[prBucket(pr)],
    checks: pr.checksState ?? "",
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Pull requests</h1>
        <p className="text-sm text-muted-foreground">
          {prs.length} open across all managed repositories.
        </p>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nothing cached yet — open the Dashboard and click <strong>Refresh data</strong>.
        </p>
      ) : (
        <PullsTable rows={rows} />
      )}
    </div>
  );
}
