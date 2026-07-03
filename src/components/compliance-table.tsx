"use client";

import type { ColumnDef } from "@tanstack/react-table";

import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/data-table";

/** One repository's Tier-0 standards compliance summary (built server-side). */
export type ComplianceRow = {
  id: string;
  repo: string;
  tier: string; // "Tier 0" | "—"
  present: number;
  missing: number;
};

const num = (key: keyof ComplianceRow): ColumnDef<ComplianceRow> => ({
  accessorKey: key,
  header: key.charAt(0).toUpperCase() + key.slice(1),
  cell: ({ row }) => <span className="tabular-nums">{row.getValue<number>(key)}</span>,
});

const columns: ColumnDef<ComplianceRow>[] = [
  {
    accessorKey: "repo",
    header: "Repository",
    cell: ({ row }) => <span className="text-muted-foreground">{row.getValue("repo")}</span>,
  },
  {
    accessorKey: "tier",
    header: "Tier",
    filterFn: "equalsString",
    cell: ({ row }) => {
      const tier = row.getValue<string>("tier");
      return <Badge variant={tier === "Tier 0" ? "secondary" : "outline"}>{tier}</Badge>;
    },
  },
  num("present"),
  num("missing"),
];

/** Sortable/filterable cross-repo Tier-0 compliance overview (client). */
export function ComplianceTable({ rows }: { rows: ComplianceRow[] }) {
  return <DataTable columns={columns} data={rows} filterColumns={["tier"]} />;
}
