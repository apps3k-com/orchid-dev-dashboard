"use client";

import { useCallback, useState, useTransition } from "react";

import type { ColumnDef } from "@tanstack/react-table";

import { DataTable } from "@/components/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { severityVariant, statusVariant } from "@/lib/audit-ui";

import { startBatchEstimate } from "./actions";
import { BatchPanel } from "./batch-panel";

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
    id: "select",
    header: ({ table }) => (
      <Checkbox
        checked={table.getIsAllPageRowsSelected() || (table.getIsSomePageRowsSelected() && "indeterminate")}
        onCheckedChange={(v) => table.toggleAllPageRowsSelected(!!v)}
        aria-label="Select all"
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(v) => row.toggleSelected(!!v)}
        aria-label="Select row"
      />
    ),
    enableSorting: false,
  },
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

/** The /audits overview table: row selection + an action bar to trigger a Fleet-Audit batch
 *  estimate for the selected repos, with a {@link BatchPanel} taking over once a batch starts. */
export function AuditsTable({ rows }: { rows: AuditRow[] }) {
  const getRowId = useCallback((r: AuditRow) => r.id, []);
  const [selected, setSelected] = useState<string[]>([]);
  const [force, setForce] = useState(false);
  const [consent, setConsent] = useState(false);
  const [batchId, setBatchId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onAudit() {
    startTransition(async () => {
      const res = await startBatchEstimate(selected, force, consent);
      if (res.ok && res.batchId) setBatchId(res.batchId);
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-4">
        <Button onClick={onAudit} disabled={selected.length === 0 || !consent || pending}>
          Audit selected ({selected.length})
        </Button>
        <div className="flex items-center gap-2">
          <Checkbox id="force-reaudit" checked={force} onCheckedChange={(v) => setForce(!!v)} />
          <Label htmlFor="force-reaudit">Re-audit unchanged</Label>
        </div>
        <div className="flex items-center gap-2">
          <Checkbox id="batch-consent" checked={consent} onCheckedChange={(v) => setConsent(!!v)} />
          <Label htmlFor="batch-consent">
            I confirm sending the selected repos&apos; config to the provider
          </Label>
        </div>
      </div>

      <DataTable
        columns={columns}
        data={rows}
        filterColumns={["status"]}
        pageSize={20}
        getRowId={getRowId}
        onSelectedIdsChange={setSelected}
      />

      {batchId && <BatchPanel batchId={batchId} onDone={() => setBatchId(null)} />}
    </div>
  );
}
