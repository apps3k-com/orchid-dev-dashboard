import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireUser } from "@/server/auth/require";
import { prisma } from "@/server/db";
import { listAppInstallations } from "@/server/github/app";

export const dynamic = "force-dynamic";

/** Authenticated overview: managed orgs, cache counts, and a manual refresh. */
export default async function DashboardPage() {
  const user = await requireUser();
  const installations = await listAppInstallations().catch(() => []);
  const [repoCount, openPrCount] = await Promise.all([
    prisma.repo.count(),
    prisma.pullRequest.count({ where: { state: "OPEN" } }),
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

      <Card>
        <CardHeader>
          <CardTitle>Cache</CardTitle>
          <CardDescription>
            Synced from GitHub by the background worker (every 5 min) or on demand.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-6 text-sm">
            <div>
              <span className="text-2xl font-semibold">{repoCount}</span>
              <span className="ml-1 text-muted-foreground">repositories</span>
            </div>
            <div>
              <span className="text-2xl font-semibold">{openPrCount}</span>
              <span className="ml-1 text-muted-foreground">open pull requests</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Managed organizations</CardTitle>
          <CardDescription>Organizations your GitHub App is installed on.</CardDescription>
        </CardHeader>
        <CardContent>
          {installations.length === 0 ? (
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
