import type { ProjectItem } from "@prisma/client";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { prisma } from "@/server/db";

export const dynamic = "force-dynamic";

const NO_STATUS = "No Status";

const TYPE_LABEL: Record<string, string> = {
  ISSUE: "issue",
  PULL_REQUEST: "PR",
  DRAFT_ISSUE: "draft",
};

/** One project item: type badge + title (linked to GitHub when it has a URL). */
function ProjectItemRow({ item }: { item: ProjectItem }) {
  return (
    <div className="flex items-start gap-2 text-sm">
      <Badge variant="outline" className="shrink-0">
        {TYPE_LABEL[item.type] ?? item.type.toLowerCase()}
      </Badge>
      {item.url ? (
        <a href={item.url} className="hover:underline" target="_blank" rel="noreferrer">
          {item.title}
          <span className="sr-only"> (opens in a new tab)</span>
        </a>
      ) : (
        <span>{item.title}</span>
      )}
    </div>
  );
}

/** Per-project board: the project's items grouped into columns by their Status field value. */
export default async function ProjectBoardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await prisma.project.findUnique({
    where: { id },
    include: { org: true, items: { orderBy: { ghUpdatedAt: "desc" } } },
  });
  if (!project) notFound();

  const groups = new Map<string, ProjectItem[]>();
  for (const item of project.items) {
    const key = item.status ?? NO_STATUS;
    const list = groups.get(key);
    if (list) list.push(item);
    else groups.set(key, [item]);
  }
  // Stable column order: Status options alphabetically, the untracked "No Status" column last.
  const columns = [...groups.entries()].sort(([a], [b]) =>
    a === NO_STATUS ? 1 : b === NO_STATUS ? -1 : a.localeCompare(b),
  );

  return (
    <div className="space-y-6">
      <div>
        <Link href="/projects" className="text-sm text-muted-foreground hover:underline">
          ← Projects
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{project.title}</h1>
        <p className="text-sm text-muted-foreground">
          {project.org.login} · #{project.number} · {project.items.length} item
          {project.items.length === 1 ? "" : "s"} by Status.{" "}
          <a href={project.url} className="hover:underline" target="_blank" rel="noreferrer">
            Open on GitHub<span className="sr-only"> (opens in a new tab)</span>
          </a>
        </p>
      </div>

      {project.items.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No items cached — open the Dashboard and click <strong>Refresh data</strong>.
        </p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {columns.map(([status, items]) => (
            <Card key={status}>
              <CardHeader>
                <CardTitle className="flex items-center justify-between gap-2 text-base">
                  <span>{status}</span>
                  <Badge variant="secondary">{items.length}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                {items.map((item) => (
                  <ProjectItemRow key={item.id} item={item} />
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
