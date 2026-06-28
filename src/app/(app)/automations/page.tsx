import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AutomationInstallForm } from "@/components/automation-install-form";
import { RECIPES } from "@/server/automations/recipes";
import { requireUser } from "@/server/auth/require";
import { prisma } from "@/server/db";

export const dynamic = "force-dynamic";

const STATE_BADGE: Record<
  string,
  { label: string; variant: "secondary" | "outline" | "destructive" }
> = {
  installed: { label: "installed", variant: "secondary" },
  pending_pr: { label: "pending PR", variant: "outline" },
  outdated: { label: "outdated", variant: "destructive" },
  missing: { label: "missing", variant: "destructive" },
};

/** Automation recipe catalog: provision a recipe's workflow into a repo via a pull request,
 *  and show where each recipe is already installed (with reconcile state). */
export default async function AutomationsPage() {
  await requireUser();
  const [repos, installs] = await Promise.all([
    prisma.repo.findMany({
      where: { isArchived: false },
      orderBy: { nameWithOwner: "asc" },
      select: { id: true, nameWithOwner: true },
    }),
    prisma.automationInstall.findMany({
      include: { repo: { select: { nameWithOwner: true } } },
      orderBy: { repo: { nameWithOwner: "asc" } },
    }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Automations</h1>
        <p className="text-sm text-muted-foreground">
          Provision a GitHub Actions automation into a repository — each opens a pull request.
          Orchid sets the org App credentials and the recipe&apos;s config, so the workflow
          activates on merge.
        </p>
      </div>

      <div className="space-y-4">
        {RECIPES.map((recipe) => {
          const recipeInstalls = installs.filter((i) => i.recipeId === recipe.id);
          return (
            <Card key={recipe.id}>
              <CardHeader>
                <CardTitle>{recipe.name}</CardTitle>
                <CardDescription>{recipe.description}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {recipeInstalls.length > 0 ? (
                  <ul className="flex flex-col gap-2 text-sm">
                    {recipeInstalls.map((install) => {
                      const badge = STATE_BADGE[install.state] ?? {
                        label: install.state,
                        variant: "outline" as const,
                      };
                      return (
                        <li key={install.id} className="flex items-center gap-2">
                          <span className="text-muted-foreground">{install.repo.nameWithOwner}</span>
                          <Badge variant={badge.variant}>{badge.label}</Badge>
                          {install.prUrl ? (
                            <a
                              href={install.prUrl}
                              className="hover:underline"
                              target="_blank"
                              rel="noreferrer"
                            >
                              PR<span className="sr-only"> (opens in a new tab)</span>
                            </a>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                ) : null}
                {repos.length > 0 ? (
                  <AutomationInstallForm recipeId={recipe.id} inputs={recipe.inputs} repos={repos} />
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No managed repositories to install into yet — open the Dashboard and click{" "}
                    <strong>Refresh data</strong>.
                  </p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
