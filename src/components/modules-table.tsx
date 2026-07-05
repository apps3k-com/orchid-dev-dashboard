"use client";

import { useActionState, useCallback, useId, useMemo, useState, useTransition } from "react";

import { MoreHorizontal } from "lucide-react";

import type { ColumnDef } from "@tanstack/react-table";

import { DataTable } from "@/components/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  removeModule,
  updateModuleMetadata,
  type ModuleActionState,
} from "@/app/(app)/repos/[id]/modules/actions";

/** One module row: yaml name + Orchid metadata + the count of issues carrying its `module:*` label. */
export type ModuleRow = {
  name: string;
  description: string;
  assignedIssues: number;
  status: string; // active | deprecated
};

const INITIAL: ModuleActionState = { ok: false, message: "" };

/** Build the module columns; row actions edit metadata (dialog) or remove the module (via PR). */
function createColumns(
  onEdit: (row: ModuleRow) => void,
  onRemove: (name: string) => void,
  busy: boolean,
): ColumnDef<ModuleRow>[] {
  return [
    {
      accessorKey: "name",
      header: "Module name",
      cell: ({ row }) => <span className="font-medium">{row.getValue("name")}</span>,
    },
    {
      accessorKey: "description",
      header: "Description",
      enableSorting: false,
      cell: ({ row }) => {
        const d = row.getValue<string>("description");
        return d ? (
          <span className="text-muted-foreground">{d}</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        );
      },
    },
    {
      accessorKey: "assignedIssues",
      header: "Assigned issues",
      cell: ({ row }) => <span className="text-muted-foreground">{row.getValue("assignedIssues")}</span>,
    },
    {
      accessorKey: "status",
      header: "Status",
      filterFn: "equalsString",
      cell: ({ row }) => {
        const s = row.getValue<string>("status");
        return <Badge variant={s === "deprecated" ? "outline" : "secondary"}>{s}</Badge>;
      },
    },
    {
      id: "actions",
      enableSorting: false,
      cell: ({ row }) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="size-8 p-0"
              aria-label={`Actions for ${row.original.name}`}
            >
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => onEdit(row.original)}>Edit metadata</DropdownMenuItem>
            <DropdownMenuItem
              disabled={busy}
              variant="destructive"
              onSelect={() => onRemove(row.original.name)}
            >
              Remove (opens PR)
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];
}

/** Sortable/filterable module table: description + status are edited in-place (DB); adding/removing a
 *  module name opens a PR against `.github/modules.yaml`. */
export function ModulesTable({ repoId, rows }: { repoId: string; rows: ModuleRow[] }) {
  const [editing, setEditing] = useState<ModuleRow | null>(null);
  const [msg, setMsg] = useState("");
  const [busy, startTransition] = useTransition();

  const onRemove = useCallback(
    (name: string) =>
      startTransition(async () => {
        const res = await removeModule(repoId, name);
        setMsg(res.message);
      }),
    [repoId],
  );
  const columns = useMemo(() => createColumns(setEditing, onRemove, busy), [onRemove, busy]);

  return (
    <>
      <DataTable columns={columns} data={rows} filterColumns={["status"]} />
      {msg ? (
        <p role="status" aria-live="polite" className="mt-3 text-sm text-muted-foreground">
          {msg}
        </p>
      ) : null}

      <Dialog open={editing !== null} onOpenChange={(open) => (open ? null : setEditing(null))}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit module{editing ? ` · ${editing.name}` : ""}</DialogTitle>
            <DialogDescription>
              Description + status are Orchid metadata and save immediately (no pull request).
            </DialogDescription>
          </DialogHeader>
          {editing ? (
            <EditModuleForm key={editing.name} repoId={repoId} module={editing} />
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Inline edit form for a module's description + status (writes metadata directly). */
function EditModuleForm({ repoId, module }: { repoId: string; module: ModuleRow }) {
  const [state, action, pending] = useActionState(updateModuleMetadata, INITIAL);
  const [status, setStatus] = useState(module.status);
  const descId = useId();
  const statusId = useId();

  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="repoId" value={repoId} />
      <input type="hidden" name="name" value={module.name} />
      <input type="hidden" name="status" value={status} />

      <div className="flex flex-col gap-2">
        <Label htmlFor={descId}>Description</Label>
        <Input
          id={descId}
          name="description"
          defaultValue={module.description}
          placeholder="What this module covers"
          autoComplete="off"
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor={statusId}>Status</Label>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger id={statusId} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="active">active</SelectItem>
              <SelectItem value="deprecated">deprecated</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
      </div>
      <p
        role="status"
        aria-live="polite"
        className={`text-sm ${!state.message ? "" : state.ok ? "text-muted-foreground" : "text-destructive"}`}
      >
        {state.message}
      </p>
    </form>
  );
}
