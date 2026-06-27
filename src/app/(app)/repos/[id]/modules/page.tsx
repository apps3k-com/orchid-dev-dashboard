import Link from "next/link";
import { notFound } from "next/navigation";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ModulesForm } from "@/components/modules-form";
import { requireUser } from "@/server/auth/require";
import { prisma } from "@/server/db";
import { getRepoModules } from "@/server/github/modules";

export const dynamic = "force-dynamic";

/** Per-repo editor for `.github/modules.yaml`. Saving opens a pull request (write-back via PR). */
export default async function RepoModulesPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const repo = await prisma.repo.findUnique({ where: { id } });
  if (!repo) notFound();

  const modules = await getRepoModules(repo).catch(() => null);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/repos" className="text-sm text-muted-foreground hover:underline">
          ← Repositories
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Modules</h1>
        <p className="text-sm text-muted-foreground">
          <code>{repo.nameWithOwner}</code> · <code>.github/modules.yaml</code> — changes open a
          pull request against <code>{repo.defaultBranch}</code>.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Module taxonomy</CardTitle>
          <CardDescription>
            {modules === null
              ? "Could not read the current modules."
              : `${modules.length} module${modules.length === 1 ? "" : "s"}`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {modules === null ? (
            <p className="text-sm text-destructive">
              Could not reach GitHub to read <code>.github/modules.yaml</code>. Try refreshing.
            </p>
          ) : (
            <ModulesForm repoId={repo.id} modules={modules} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
