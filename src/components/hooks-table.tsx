"use client";

import type { ColumnDef } from "@tanstack/react-table";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/data-table";

/** One repository's agent-hook drift summary vs the canonical template (built server-side). */
export type HookRow = {
  id: string;
  repo: string;
  status: string;
  match: number;
  outdated: number;
  missing: number;
  extra: number;
};

const num = (key: keyof HookRow): ColumnDef<HookRow> => ({
  accessorKey: key,
  header: key.charAt(0).toUpperCase() + key.slice(1),
  cell: ({ row }) => <span className="tabular-nums">{row.getValue<number>(key)}</span>,
});

const columns: ColumnDef<HookRow>[] = [
  {
    accessorKey: "repo",
    header: "Repository",
    cell: ({ row }) => (
      <Link href={`/hooks/${row.original.id}`} className="text-muted-foreground hover:underline">
        {row.getValue("repo")}
      </Link>
    ),
  },
  {
    accessorKey: "status",
    header: "Status",
    filterFn: "equalsString",
    cell: ({ row }) => {
      const status = row.getValue<string>("status");
      return <Badge variant={status === "in sync" ? "secondary" : "destructive"}>{status}</Badge>;
    },
  },
  num("match"),
  num("outdated"),
  num("missing"),
  num("extra"),
];

/** Sortable/filterable cross-repo agent-hook drift overview (client). */
export function HooksTable({ rows }: { rows: HookRow[] }) {
  return <DataTable columns={columns} data={rows} filterColumns={["status"]} />;
}
