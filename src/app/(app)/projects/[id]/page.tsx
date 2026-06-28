import Link from "next/link";
import { notFound } from "next/navigation";

import { ProjectBoard, type BoardItem } from "@/components/project-board";
import { requireUser } from "@/server/auth/require";
import { prisma } from "@/server/db";

export const dynamic = "force-dynamic";

/** Per-project board: the project's items grouped into columns by their Status field value, with
 *  repo + assignee filters and per-item priority/assignees/labels (rendered by ProjectBoard). */
export default async function ProjectBoardPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const project = await prisma.project.findUnique({
    where: { id },
    include: { org: true, items: { orderBy: { ghUpdatedAt: "desc" } } },
  });
  if (!project) notFound();

  const items: BoardItem[] = project.items.map((item) => ({
    id: item.id,
    type: item.type,
    title: item.title,
    url: item.url,
    status: item.status,
    priority: item.priority,
    repo: item.contentRepo,
    assignees: item.assignees,
    labels: item.labels,
  }));

  return (
    <div className="space-y-6">
      <div>
        <Link href="/projects" className="text-sm text-muted-foreground hover:underline">
          ← Projects
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{project.title}</h1>
        <p className="text-sm text-muted-foreground">
          {project.org.login} · #{project.number} · {items.length} item
          {items.length === 1 ? "" : "s"} by Status.{" "}
          <a href={project.url} className="hover:underline" target="_blank" rel="noreferrer">
            Open on GitHub<span className="sr-only"> (opens in a new tab)</span>
          </a>
        </p>
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No items cached — open the Dashboard and click <strong>Refresh data</strong>.
        </p>
      ) : (
        <ProjectBoard items={items} />
      )}
    </div>
  );
}
