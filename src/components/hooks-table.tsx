"use client";

import type { ColumnDef } from "@tanstack/react-table";

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
    cell: ({ row }) => <span className="text-muted-foreground">{row.getValue("repo")}</span>,
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
