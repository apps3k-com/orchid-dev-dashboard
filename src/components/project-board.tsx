"use client";

import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const NO_STATUS = "No Status";
const ALL = "__all__";

const TYPE_LABEL: Record<string, string> = {
  ISSUE: "issue",
  PULL_REQUEST: "PR",
  DRAFT_ISSUE: "draft",
};

/** One board item (serializable; built server-side from a ProjectItem cache row). */
export type BoardItem = {
  id: string;
  type: string;
  title: string;
  url: string | null;
  status: string | null;
  priority: string | null;
  repo: string | null;
  assignees: string[];
  labels: string[];
};

/** A single item: type + linked title, then its priority / repo / assignees / labels. */
function ItemRow({ item }: { item: BoardItem }) {
  const hasMeta =
    item.priority || item.repo || item.assignees.length > 0 || item.labels.length > 0;
  return (
    <div className="flex flex-col gap-1 text-sm">
      <div className="flex items-start gap-2">
        <Badge variant="outline" className="shrink-0">
          {TYPE_LABEL[item.type] ?? item.type.toLowerCase()}
        </Badge>
        {item.url ? (
          <a href={item.url} target="_blank" rel="noreferrer" className="hover:underline">
            {item.title}
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
        ) : (
          <span>{item.title}</span>
        )}
      </div>
      {hasMeta ? (
        <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
          {item.priority ? <Badge variant="secondary">{item.priority}</Badge> : null}
          {item.repo ? <span>{item.repo}</span> : null}
          {item.assignees.map((login) => (
            <span key={login}>@{login}</span>
          ))}
          {item.labels.map((label) => (
            <Badge key={label} variant="outline">
              {label}
            </Badge>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** Per-project board (client): items grouped into columns by Status, with repo + assignee filters.
 *  Grouping/filtering happen on the already-fetched cache rows — no extra round-trips. */
export function ProjectBoard({ items }: { items: BoardItem[] }) {
  const [repo, setRepo] = useState(ALL);
  const [assignee, setAssignee] = useState(ALL);

  // Cross-constrain the two filters so each only offers options that yield results given the other
  // (picking from the offered set can never produce an empty board, and selections stay valid).
  const repos = useMemo(
    () =>
      [
        ...new Set(
          items
            .filter((i) => assignee === ALL || i.assignees.includes(assignee))
            .map((i) => i.repo)
            .filter((r): r is string => Boolean(r)),
        ),
      ].sort(),
    [items, assignee],
  );
  const assignees = useMemo(
    () =>
      [
        ...new Set(items.filter((i) => repo === ALL || i.repo === repo).flatMap((i) => i.assignees)),
      ].sort(),
    [items, repo],
  );

  const filtered = items.filter(
    (i) =>
      (repo === ALL || i.repo === repo) && (assignee === ALL || i.assignees.includes(assignee)),
  );

  const groups = new Map<string, BoardItem[]>();
  for (const item of filtered) {
    const key = item.status ?? NO_STATUS;
    const list = groups.get(key);
    if (list) list.push(item);
    else groups.set(key, [item]);
  }
  const columns = [...groups.entries()].sort(([a], [b]) =>
    a === NO_STATUS ? 1 : b === NO_STATUS ? -1 : a.localeCompare(b),
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        <Select value={repo} onValueChange={setRepo}>
          <SelectTrigger className="w-64">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value={ALL}>All repositories</SelectItem>
              {repos.map((r) => (
                <SelectItem key={r} value={r}>
                  {r}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>

        {assignees.length > 0 ? (
          <Select value={assignee} onValueChange={setAssignee}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value={ALL}>All assignees</SelectItem>
                {assignees.map((a) => (
                  <SelectItem key={a} value={a}>
                    @{a}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        ) : null}
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground">No items match the current filters.</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {columns.map(([status, group]) => (
            <Card key={status}>
              <CardHeader>
                <CardTitle className="flex items-center justify-between gap-2">
                  <span>{status}</span>
                  <Badge variant="secondary">{group.length}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                {group.map((item) => (
                  <ItemRow key={item.id} item={item} />
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
