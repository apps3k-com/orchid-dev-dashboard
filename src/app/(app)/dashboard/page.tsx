import { Building2Icon, FolderGit2Icon, GitPullRequestIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import StatisticsCard from "@/components/shadcn-studio/blocks/statistics-card-03";
import { requireUser } from "@/server/auth/require";
import { prisma } from "@/server/db";
import { listAppInstallations } from "@/server/github/app";

export const dynamic = "force-dynamic";

/** Authenticated overview: cache stat cards, managed orgs, and a manual refresh. */
export default async function DashboardPage() {
  const user = await requireUser();
  let installations: Awaited<ReturnType<typeof listAppInstallations>> = [];
  let installationsFailed = false;
  try {
    installations = await listAppInstallations();
  } catch {
    installationsFailed = true;
  }
  const [repoCount, archivedCount, openPrCount, draftCount] = await Promise.all([
    prisma.repo.count(),
    prisma.repo.count({ where: { isArchived: true } }),
    prisma.pullRequest.count({ where: { state: "OPEN" } }),
    prisma.pullRequest.count({ where: { state: "OPEN", isDraft: true } }),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">Signed in as {user.login}</p>
        </div>
        <form action="/api/refresh" method="post">
          <Button type="submit" size="sm">
            Refresh data
          </Button>
        </form>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatisticsCard
          icon={<FolderGit2Icon />}
          value={String(repoCount)}
          title="Repositories"
          badgeContent={archivedCount > 0 ? `${archivedCount} archived` : undefined}
        />
        <StatisticsCard
          icon={<GitPullRequestIcon />}
          value={String(openPrCount)}
          title="Open pull requests"
          badgeContent={draftCount > 0 ? `${draftCount} draft` : undefined}
        />
        <StatisticsCard
          icon={<Building2Icon />}
          value={installationsFailed ? "—" : String(installations.length)}
          title="Organizations"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Managed organizations</CardTitle>
          <CardDescription>Organizations your GitHub App is installed on.</CardDescription>
        </CardHeader>
        <CardContent>
          {installationsFailed ? (
            <p className="text-sm text-destructive">
              Could not reach GitHub — the installation list is temporarily unavailable. Try
              refreshing.
            </p>
          ) : installations.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No installations yet — install the GitHub App on an organization from{" "}
              <a className="underline" href="/setup">
                setup
              </a>
              .
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {installations.map((inst) => (
                <Badge key={inst.id} variant="secondary">
                  {inst.login}
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
