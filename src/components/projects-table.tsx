"use client";

import type { ColumnDef } from "@tanstack/react-table";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/data-table";

/** One GitHub ProjectV2 row in the cross-org list (serializable, built server-side). */
export type ProjectRow = {
  id: string;
  org: string;
  number: number;
  title: string;
  url: string;
  items: number;
  status: string;
};

const columns: ColumnDef<ProjectRow>[] = [
  {
    accessorKey: "org",
    header: "Organization",
    filterFn: "equalsString",
    cell: ({ row }) => <span className="text-muted-foreground">{row.getValue("org")}</span>,
  },
  {
    accessorKey: "title",
    header: "Project",
    cell: ({ row }) => (
      <a
        href={row.original.url}
        className="font-medium hover:underline"
        target="_blank"
        rel="noreferrer"
      >
        #{row.original.number} {row.getValue("title")}
        <span className="sr-only"> (opens in a new tab)</span>
      </a>
    ),
  },
  {
    accessorKey: "items",
    header: "Items",
    cell: ({ row }) => {
      const count = row.getValue<number>("items");
      return count > 0 ? (
        <Link href={`/projects/${row.original.id}`} className="tabular-nums hover:underline">
          {count}
        </Link>
      ) : (
        <span className="tabular-nums text-muted-foreground">0</span>
      );
    },
  },
  {
    accessorKey: "status",
    header: "Status",
    filterFn: "equalsString",
    cell: ({ row }) => {
      const status = row.getValue<string>("status");
      return <Badge variant={status === "open" ? "secondary" : "outline"}>{status}</Badge>;
    },
  },
];

/** Sortable/filterable list of GitHub ProjectsV2 across all managed orgs (client). */
export function ProjectsTable({ rows }: { rows: ProjectRow[] }) {
  return <DataTable columns={columns} data={rows} filterColumns={["org", "status"]} />;
}
