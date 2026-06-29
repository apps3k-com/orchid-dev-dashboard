"use client";

import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";

import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/data-table";

/** One repository row in the inventory (serializable, built server-side). */
export type RepoRow = {
  id: string;
  nameWithOwner: string;
  url: string;
  defaultBranch: string;
  visibility: string;
  archived: boolean;
  openPrs: number;
};

const columns: ColumnDef<RepoRow>[] = [
  {
    accessorKey: "nameWithOwner",
    header: "Repository",
    cell: ({ row }) => (
      <div className="flex items-center gap-2">
        <a
          href={row.original.url}
          className="font-medium hover:underline"
          target="_blank"
          rel="noreferrer"
        >
          {row.getValue("nameWithOwner")}
          <span className="sr-only"> (opens in a new tab)</span>
        </a>
        {row.original.archived ? <Badge variant="outline">archived</Badge> : null}
      </div>
    ),
  },
  {
    accessorKey: "defaultBranch",
    header: "Default branch",
    cell: ({ row }) => <span className="text-muted-foreground">{row.getValue("defaultBranch")}</span>,
  },
  {
    accessorKey: "visibility",
    header: "Visibility",
    filterFn: "equalsString",
    cell: ({ row }) => <Badge variant="secondary">{row.getValue("visibility")}</Badge>,
  },
  {
    accessorKey: "openPrs",
    header: "Open PRs",
    cell: ({ row }) => <span className="tabular-nums">{row.getValue("openPrs")}</span>,
  },
  {
    id: "actions",
    header: () => <span className="sr-only">Actions</span>,
    enableSorting: false,
    cell: ({ row }) => (
      <div className="flex items-center gap-3">
        <Link
          href={`/repos/${row.original.id}/modules`}
          className="text-sm font-medium hover:underline"
        >
          Modules
        </Link>
        <Link
          href={`/repos/${row.original.id}/audit`}
          className="text-sm font-medium hover:underline"
        >
          Audit
        </Link>
      </div>
    ),
  },
];

/** Sortable/filterable repository inventory across all managed orgs (client). */
export function ReposTable({ rows }: { rows: RepoRow[] }) {
  return <DataTable columns={columns} data={rows} filterColumns={["visibility"]} />;
}
