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

export const dynamic = "force-dynamic";

/** Repository inventory across managed orgs, with cached open-PR counts. */
export default async function ReposPage() {
  const repos = await prisma.repo.findMany({
    include: { _count: { select: { pulls: true } } },
    orderBy: { nameWithOwner: "asc" },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Repositories</h1>
        <p className="text-sm text-muted-foreground">{repos.length} across all managed organizations.</p>
      </div>

      {repos.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nothing cached yet — open the Dashboard and click <strong>Refresh data</strong>.
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Repository</TableHead>
              <TableHead>Default branch</TableHead>
              <TableHead>Visibility</TableHead>
              <TableHead className="text-right">Open PRs</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {repos.map((repo) => (
              <TableRow key={repo.id}>
                <TableCell>
                  <a
                    href={repo.url ?? `https://github.com/${repo.nameWithOwner}`}
                    className="font-medium hover:underline"
                  >
                    {repo.nameWithOwner}
                  </a>
                  {repo.isArchived ? (
                    <Badge variant="outline" className="ml-2">
                      archived
                    </Badge>
                  ) : null}
                </TableCell>
                <TableCell className="text-muted-foreground">{repo.defaultBranch}</TableCell>
                <TableCell>
                  <Badge variant="secondary">{repo.isPrivate ? "private" : "public"}</Badge>
                </TableCell>
                <TableCell className="text-right">{repo._count.pulls}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
