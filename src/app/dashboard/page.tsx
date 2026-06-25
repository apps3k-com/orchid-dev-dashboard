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
import { listAppInstallations } from "@/server/github/app";

export const dynamic = "force-dynamic";

/**
 * Authenticated home. Confirms the session + which organizations Orchid manages (the App's
 * installations). The cross-repo cockpit (PRs, Projects, repos, hooks) lands in Increment 4.
 */
export default async function DashboardPage() {
  const user = await requireUser();
  const installations = await listAppInstallations().catch(() => []);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-6 py-12">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Orchid</h1>
          <p className="text-sm text-muted-foreground">Signed in as {user.login}</p>
        </div>
        <form action="/api/auth/logout" method="post">
          <Button type="submit" variant="outline" size="sm">
            Sign out
          </Button>
        </form>
      </div>

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

      <Card>
        <CardHeader>
          <CardTitle>Cockpit</CardTitle>
          <CardDescription>
            Pull requests, Projects, repositories and agent hooks arrive in the next increments.
          </CardDescription>
        </CardHeader>
      </Card>
    </main>
  );
}
