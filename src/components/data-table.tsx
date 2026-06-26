"use client";

import { useId, useMemo, useState } from "react";

import {
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronUpIcon,
} from "lucide-react";

import type {
  Column,
  ColumnDef,
  ColumnFiltersState,
  PaginationState,
} from "@tanstack/react-table";
import {
  flexRender,
  getCoreRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
} from "@/components/ui/pagination";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { usePagination } from "@/hooks/use-pagination";

/** Faceted single-select filter for one column (derived from the shadcnstudio datatable block). */
function Filter<TData>({ column }: { column: Column<TData, unknown> }) {
  const id = useId();
  const columnFilterValue = column.getFilterValue();
  const columnHeader =
    typeof column.columnDef.header === "string" ? column.columnDef.header : "";

  const faceted = column.getFacetedUniqueValues();
  const sortedUniqueValues = useMemo(() => {
    const values = Array.from(faceted.keys());
    return Array.from(new Set(values.map((v) => String(v)).filter(Boolean))).sort();
  }, [faceted]);

  return (
    <div className="flex w-full flex-col gap-2">
      <Label htmlFor={`${id}-select`}>Filter {columnHeader}</Label>
      <Select
        value={columnFilterValue?.toString() ?? "all"}
        onValueChange={(value) =>
          column.setFilterValue(value === "all" ? undefined : value)
        }
      >
        <SelectTrigger id={`${id}-select`} className="w-full capitalize">
          <SelectValue placeholder={`Filter ${columnHeader}`} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All</SelectItem>
          {sortedUniqueValues.map((value) => (
            <SelectItem key={value} value={value} className="capitalize">
              {value}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/** Props for {@link DataTable}. */
export type DataTableProps<TData, TValue> = {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  /** Column ids to expose as faceted select filters above the table. */
  filterColumns?: string[];
  /** Rows per page (default 10). */
  pageSize?: number;
};

/** Generic sortable, filterable and paginated data table, composed from the shadcnstudio
 *  datatable block (faceted filter row, sortable headers, pagination footer). Column
 *  definitions and row data are supplied by the caller, so it is reused across cockpit pages. */
export function DataTable<TData, TValue>({
  columns,
  data,
  filterColumns = [],
  pageSize = 10,
}: DataTableProps<TData, TValue>) {
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize,
  });

  // React Compiler cannot memoize TanStack Table's returned functions; opting this
  // client data table out of compiler memoization is expected and safe.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data,
    columns,
    state: { columnFilters, pagination },
    onColumnFiltersChange: setColumnFilters,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
    getPaginationRowModel: getPaginationRowModel(),
    enableSortingRemoval: false,
  });

  const { pages, showLeftEllipsis, showRightEllipsis } = usePagination({
    currentPage: table.getState().pagination.pageIndex + 1,
    totalPages: table.getPageCount(),
    paginationItemsToDisplay: 3,
  });

  return (
    <div className="w-full">
      {filterColumns.length > 0 && (
        <div className="grid grid-cols-1 gap-4 pb-6 sm:grid-cols-2 md:grid-cols-3">
          {filterColumns.map((id) => {
            const column = table.getColumn(id);
            return column ? <Filter key={id} column={column} /> : null;
          })}
        </div>
      )}

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="h-12">
                {headerGroup.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    className="text-muted-foreground first:pl-4 last:pr-4"
                  >
                    {header.isPlaceholder ? null : header.column.getCanSort() ? (
                      <div
                        className="flex h-full cursor-pointer items-center gap-2 select-none"
                        onClick={header.column.getToggleSortingHandler()}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            header.column.getToggleSortingHandler()?.(e);
                          }
                        }}
                        tabIndex={0}
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {{
                          asc: <ChevronUpIcon className="shrink-0 opacity-60" size={16} aria-hidden="true" />,
                          desc: <ChevronDownIcon className="shrink-0 opacity-60" size={16} aria-hidden="true" />,
                        }[header.column.getIsSorted() as string] ?? null}
                      </div>
                    ) : (
                      flexRender(header.column.columnDef.header, header.getContext())
                    )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id} className="h-13 first:pl-4 last:pr-4">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center">
                  No results.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {table.getPageCount() > 1 && (
        <div className="flex items-center justify-between gap-3 py-4 max-sm:flex-col">
          <p className="text-muted-foreground text-sm whitespace-nowrap" aria-live="polite">
            Showing{" "}
            <span>
              {table.getRowCount() === 0
                ? 0
                : table.getState().pagination.pageIndex * table.getState().pagination.pageSize + 1}{" "}
              to{" "}
              {Math.min(
                (table.getState().pagination.pageIndex + 1) * table.getState().pagination.pageSize,
                table.getRowCount(),
              )}
            </span>{" "}
            of <span>{table.getRowCount()}</span>
          </p>
          <Pagination className="mx-0 w-auto justify-end">
            <PaginationContent>
              <PaginationItem>
                <Button
                  variant="ghost"
                  onClick={() => table.previousPage()}
                  disabled={!table.getCanPreviousPage()}
                  aria-label="Go to previous page"
                >
                  <ChevronLeftIcon aria-hidden="true" />
                  Previous
                </Button>
              </PaginationItem>
              {showLeftEllipsis && (
                <PaginationItem>
                  <PaginationEllipsis />
                </PaginationItem>
              )}
              {pages.map((page) => {
                const isActive = page === table.getState().pagination.pageIndex + 1;
                return (
                  <PaginationItem key={page}>
                    <Button
                      size="icon"
                      variant={isActive ? "default" : "ghost"}
                      onClick={() => table.setPageIndex(page - 1)}
                      aria-current={isActive ? "page" : undefined}
                    >
                      {page}
                    </Button>
                  </PaginationItem>
                );
              })}
              {showRightEllipsis && (
                <PaginationItem>
                  <PaginationEllipsis />
                </PaginationItem>
              )}
              <PaginationItem>
                <Button
                  variant="ghost"
                  onClick={() => table.nextPage()}
                  disabled={!table.getCanNextPage()}
                  aria-label="Go to next page"
                >
                  Next
                  <ChevronRightIcon aria-hidden="true" />
                </Button>
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </div>
      )}
    </div>
  );
}
