import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AutomationInstallForm } from "@/components/automation-install-form";
import { RECIPES } from "@/server/automations/recipes";
import { requireUser } from "@/server/auth/require";
import { prisma } from "@/server/db";

export const dynamic = "force-dynamic";

/** Automation recipe catalog: provision a recipe's workflow into a repo via a pull request. */
export default async function AutomationsPage() {
  await requireUser();
  const repos = await prisma.repo.findMany({
    where: { isArchived: false },
    orderBy: { nameWithOwner: "asc" },
    select: { id: true, nameWithOwner: true },
  });

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

      {repos.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No managed repositories yet — open the Dashboard and click <strong>Refresh data</strong>.
        </p>
      ) : (
        <div className="space-y-4">
          {RECIPES.map((recipe) => (
            <Card key={recipe.id}>
              <CardHeader>
                <CardTitle>{recipe.name}</CardTitle>
                <CardDescription>{recipe.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <AutomationInstallForm
                  recipeId={recipe.id}
                  inputs={recipe.inputs}
                  repos={repos}
                />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
