import { ProjectsTable, type ProjectRow } from "@/components/projects-table";
import { prisma } from "@/server/db";

export const dynamic = "force-dynamic";

/** Cross-org list of GitHub ProjectsV2 — sortable + filterable, read from the cache. */
export default async function ProjectsPage() {
  const projects = await prisma.project.findMany({
    include: { org: true },
    orderBy: [{ closed: "asc" }, { ghUpdatedAt: "desc" }],
  });

  const rows: ProjectRow[] = projects.map((p) => ({
    id: p.id,
    org: p.org.login,
    number: p.number,
    title: p.title,
    url: p.url,
    items: p.itemCount,
    status: p.closed ? "closed" : "open",
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
        <p className="text-sm text-muted-foreground">
          {projects.length} GitHub Projects across all managed organizations.
        </p>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nothing cached yet — open the Dashboard and click <strong>Refresh data</strong>.
        </p>
      ) : (
        <ProjectsTable rows={rows} />
      )}
    </div>
  );
}
