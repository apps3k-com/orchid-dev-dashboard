import Link from "next/link";
import { notFound } from "next/navigation";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AddModuleForm } from "@/components/add-module-form";
import { ModulesTable, type ModuleRow } from "@/components/modules-table";
import { buildModuleRows } from "@/lib/modules";
import { requireUser } from "@/server/auth/require";
import { prisma } from "@/server/db";
import { getRepoModules } from "@/server/github/modules";

export const dynamic = "force-dynamic";

/** Per-repo module manager. Module NAMES live in `.github/modules.yaml` (add/remove opens a PR and
 *  drives the label/dropdown sync); description + status are Orchid metadata edited in place; the
 *  assigned-issue count comes from cached project items carrying the `module:*` label. */
export default async function RepoModulesPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const repo = await prisma.repo.findUnique({ where: { id } });
  if (!repo) notFound();

  const names = await getRepoModules(repo).catch(() => null);
  const [metadata, items] = await Promise.all([
    prisma.module.findMany({ where: { repoId: repo.id } }),
    prisma.projectItem.findMany({
      where: { contentRepo: repo.nameWithOwner, type: "ISSUE" },
      select: { labels: true },
    }),
  ]);
  const rows: ModuleRow[] = buildModuleRows(
    names ?? [],
    metadata,
    items.map((i) => i.labels),
  );

  return (
    <div className="space-y-6">
      <div>
        <Link href="/repos" className="text-sm text-muted-foreground hover:underline">
          ← Repositories
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Modules</h1>
        <p className="text-sm text-muted-foreground">
          <code>{repo.nameWithOwner}</code> — module names live in <code>.github/modules.yaml</code>{" "}
          (adding/removing opens a pull request against <code>{repo.defaultBranch}</code>);
          description + status are Orchid metadata.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Add a module</CardTitle>
          <CardDescription>
            Saves the description/status and opens a PR adding the name to the taxonomy.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AddModuleForm repoId={repo.id} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Modules</CardTitle>
          <CardDescription>
            {names === null
              ? "Could not read .github/modules.yaml."
              : `${rows.length} module${rows.length === 1 ? "" : "s"} · assigned-issue counts from cached project items`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {names === null ? (
            <p className="text-sm text-destructive">
              Could not reach GitHub to read <code>.github/modules.yaml</code>. Try refreshing.
            </p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No modules yet — add one above.</p>
          ) : (
            <ModulesTable repoId={repo.id} rows={rows} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
