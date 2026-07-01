"use client";

import type { ColumnDef } from "@tanstack/react-table";

import { DataTable } from "@/components/data-table";
import { Badge } from "@/components/ui/badge";
import { severityVariant, statusVariant } from "@/lib/audit-ui";

/** One repo row on the /audits overview (serializable, built server-side). */
export type AuditRow = {
  id: string;
  nameWithOwner: string;
  auditHref: string;
  status: string; // completed | failed | running | pending | none
  score: number | null;
  worstSeverity: string | null;
  findingCount: number;
  lastRun: string | null; // ISO
  usd: number | null;
};

const columns: ColumnDef<AuditRow>[] = [
  {
    accessorKey: "nameWithOwner",
    header: "Repository",
    cell: ({ row }) => (
      <a href={row.original.auditHref} className="font-medium hover:underline">
        {row.getValue("nameWithOwner")}
      </a>
    ),
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) =>
      row.original.status === "none" ? (
        <span className="text-muted-foreground">—</span>
      ) : (
        <Badge variant={statusVariant(row.original.status)}>{row.original.status}</Badge>
      ),
  },
  {
    accessorKey: "score",
    header: "Score",
    cell: ({ row }) => (row.original.score == null ? "—" : `${row.original.score}/100`),
  },
  {
    accessorKey: "findingCount",
    header: "Findings",
    cell: ({ row }) =>
      row.original.worstSeverity ? (
        <span className="flex items-center gap-2">
          <Badge variant={severityVariant(row.original.worstSeverity)}>{row.original.worstSeverity}</Badge>
          {row.original.findingCount}
        </span>
      ) : (
        row.original.findingCount
      ),
  },
  {
    accessorKey: "lastRun",
    header: "Last run",
    cell: ({ row }) =>
      row.original.lastRun ? new Date(row.original.lastRun).toLocaleDateString() : "—",
  },
  {
    accessorKey: "usd",
    header: "Cost",
    cell: ({ row }) => (row.original.usd == null ? "—" : `$${row.original.usd.toFixed(2)}`),
  },
];

/** The /audits overview table (read-only in this task; selection is added in Task 7). */
export function AuditsTable({ rows }: { rows: AuditRow[] }) {
  return <DataTable columns={columns} data={rows} filterColumns={["status"]} pageSize={20} />;
}
