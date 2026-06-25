import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { prisma } from "@/server/db";
import { BUCKET_LABEL, BUCKET_ORDER, type PrBucket, prBucket } from "@/server/pulls";

export const dynamic = "force-dynamic";

function checksBadge(state: string | null) {
  if (state === "SUCCESS") return <Badge variant="secondary">passing</Badge>;
  if (state === "FAILURE" || state === "ERROR") return <Badge variant="destructive">failing</Badge>;
  if (state === "PENDING") return <Badge variant="outline">pending</Badge>;
  return <span className="text-muted-foreground">—</span>;
}

/** Cross-repo board of open pull requests, grouped by status (from the cache). */
export default async function PullsPage() {
  const prs = await prisma.pullRequest.findMany({
    where: { state: "OPEN" },
    include: { repo: true },
    orderBy: [{ ghUpdatedAt: "desc" }],
  });

  const groups = new Map<PrBucket, typeof prs>();
  for (const pr of prs) {
    const bucket = prBucket(pr);
    const list = groups.get(bucket) ?? [];
    list.push(pr);
    groups.set(bucket, list);
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Pull requests</h1>
        <p className="text-sm text-muted-foreground">
          {prs.length} open across all managed repositories.
        </p>
      </div>

      {prs.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nothing cached yet — open the Dashboard and click <strong>Refresh data</strong>.
        </p>
      ) : (
        BUCKET_ORDER.map((bucket) => {
          const list = groups.get(bucket);
          if (!list || list.length === 0) return null;
          return (
            <section key={bucket} className="space-y-3">
              <h2 className="flex items-center gap-2 text-sm font-semibold">
                {BUCKET_LABEL[bucket]} <Badge variant="secondary">{list.length}</Badge>
              </h2>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Repository</TableHead>
                    <TableHead>Pull request</TableHead>
                    <TableHead>Author</TableHead>
                    <TableHead>Base</TableHead>
                    <TableHead>Checks</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {list.map((pr) => (
                    <TableRow key={pr.id}>
                      <TableCell className="text-muted-foreground">{pr.repo.nameWithOwner}</TableCell>
                      <TableCell>
                        <a href={pr.url} className="font-medium hover:underline">
                          #{pr.number} {pr.title}
                        </a>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{pr.authorLogin ?? "—"}</TableCell>
                      <TableCell className="text-muted-foreground">{pr.baseRef}</TableCell>
                      <TableCell>{checksBadge(pr.checksState)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </section>
          );
        })
      )}
    </div>
  );
}
