"use client";

import { useMemo, useState } from "react";

import type { ColumnDef } from "@tanstack/react-table";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/data-table";
import { PullRequestDetailModal } from "@/components/pull-request-detail-modal";

/** One open pull request row on the cross-repo board (serializable, built server-side). */
export type PullRow = {
  id: string;
  repo: string;
  number: number;
  title: string;
  url: string;
  author: string;
  base: string;
  status: string;
  checks: string;
};

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  "Changes requested": "destructive",
  "Checks failing": "destructive",
  "Ready for review": "secondary",
  Approved: "default",
  Draft: "outline",
  Other: "outline",
};

function checksBadge(state: string) {
  if (state === "SUCCESS") return <Badge variant="secondary">passing</Badge>;
  if (state === "FAILURE" || state === "ERROR") return <Badge variant="destructive">failing</Badge>;
  if (state === "PENDING") return <Badge variant="outline">pending</Badge>;
  return <span className="text-muted-foreground">—</span>;
}

/** Build the PR-board columns. The title cell opens the detail modal for its row via `onOpen`. */
function createColumns(onOpen: (row: PullRow) => void): ColumnDef<PullRow>[] {
  return [
    {
      accessorKey: "repo",
      header: "Repository",
      filterFn: "equalsString",
      cell: ({ row }) => <span className="text-muted-foreground">{row.getValue("repo")}</span>,
    },
    {
      accessorKey: "title",
      header: "Pull request",
      cell: ({ row }) => (
        <Button
          variant="link"
          onClick={() => onOpen(row.original)}
          className="h-auto whitespace-normal p-0 text-left font-medium"
        >
          #{row.original.number} {row.getValue("title")}
        </Button>
      ),
    },
    {
      accessorKey: "author",
      header: "Author",
      cell: ({ row }) => <span className="text-muted-foreground">{row.getValue("author")}</span>,
    },
    {
      accessorKey: "base",
      header: "Base",
      cell: ({ row }) => <span className="text-muted-foreground">{row.getValue("base")}</span>,
    },
    {
      accessorKey: "status",
      header: "Status",
      filterFn: "equalsString",
      cell: ({ row }) => {
        const status = row.getValue<string>("status");
        return <Badge variant={STATUS_VARIANT[status] ?? "outline"}>{status}</Badge>;
      },
    },
    {
      accessorKey: "checks",
      header: "Checks",
      enableSorting: false,
      cell: ({ row }) => checksBadge(row.getValue<string>("checks")),
    },
  ];
}

/** Sortable/filterable table of open pull requests across all managed repos (client). Clicking a
 *  PR title opens a modal with its live timeline (comments, reviews, commits, label/state events). */
export function PullsTable({ rows }: { rows: PullRow[] }) {
  const [selected, setSelected] = useState<PullRow | null>(null);
  const columns = useMemo(() => createColumns(setSelected), []);
  return (
    <>
      <DataTable columns={columns} data={rows} filterColumns={["repo", "status"]} />
      <PullRequestDetailModal
        pull={selected}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      />
    </>
  );
}
