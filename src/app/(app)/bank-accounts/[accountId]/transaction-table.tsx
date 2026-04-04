"use client";

import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  type ColumnDef,
} from "@tanstack/react-table";
import { useState, useCallback, useTransition } from "react";
import { toast } from "sonner";
import Link from "next/link";
import {
  ChevronLeft,
  ChevronRight,
  Coins,
  Download,
  FileText,
  Filter,
  Landmark,
  Loader2,
  MoreHorizontal,
  Search,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  paginateTransactionsAction,
  markAsPettyCashAction,
  unmarkPettyCashAction,
  type TransactionSearchFilters,
} from "./actions";
import type { Transaction } from "./types";

const PAGE_SIZE = 50;

interface CursorState {
  date: string;
  id: string;
}

interface TransactionTableProps {
  transactions: Transaction[];
  totalCount: number;
  hasMore: boolean;
  nextCursor: CursorState | null;
  bankAccountId: string;
}

export function TransactionTable({
  transactions: initialTransactions,
  totalCount: initialTotalCount,
  hasMore: initialHasMore,
  nextCursor: initialNextCursor,
  bankAccountId,
}: TransactionTableProps) {
  const [transactions, setTransactions] = useState(initialTransactions);
  const [totalCount, setTotalCount] = useState(initialTotalCount);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [isPending, startTransition] = useTransition();

  // Cursor history stack: each entry is the cursor used to fetch that page.
  // Page 1 has no cursor (null), page 2 uses the nextCursor from page 1, etc.
  const [cursorHistory, setCursorHistory] = useState<(CursorState | null)[]>([null]);
  const [nextCursor, setNextCursor] = useState<CursorState | null>(initialNextCursor);

  const pageNumber = cursorHistory.length;

  // Search state
  const [searchInput, setSearchInput] = useState("");
  const [activeSearch, setActiveSearch] = useState("");

  // Filter state
  const [filterOpen, setFilterOpen] = useState(false);
  const [filterDraft, setFilterDraft] = useState<TransactionSearchFilters>({});
  const [activeFilters, setActiveFilters] = useState<TransactionSearchFilters>({});

  // Selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [isBulkPending, setIsBulkPending] = useState(false);

  const activeFilterCount = Object.values(activeFilters).filter(Boolean).length;

  const buildFilters = useCallback(
    (overrides?: Partial<{ search: string; filters: TransactionSearchFilters }>): TransactionSearchFilters => {
      const search = overrides?.search ?? activeSearch;
      const filters = overrides?.filters ?? activeFilters;
      return { ...filters, search: search || undefined };
    },
    [activeSearch, activeFilters]
  );

  function fetchWithCursor(
    cursor: CursorState | null,
    overrides?: Partial<{ search: string; filters: TransactionSearchFilters }>
  ) {
    startTransition(async () => {
      const result = await paginateTransactionsAction(
        bankAccountId,
        buildFilters(overrides),
        {
          cursor,
          direction: "forward",
          pageSize: PAGE_SIZE,
        }
      );
      setTransactions(result.data as Transaction[]);
      setTotalCount(result.totalCount);
      setHasMore(result.hasMore);
      setNextCursor(result.nextCursor);
    });
  }

  function resetToFirstPage(overrides?: Partial<{ search: string; filters: TransactionSearchFilters }>) {
    setCursorHistory([null]);
    setSelectedIds(new Set());
    fetchWithCursor(null, overrides);
  }

  function handleSearch() {
    setActiveSearch(searchInput);
    resetToFirstPage({ search: searchInput });
  }

  function handleSearchKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") handleSearch();
  }

  function handleApplyFilters() {
    setActiveFilters(filterDraft);
    setFilterOpen(false);
    resetToFirstPage({ filters: filterDraft });
  }

  function handleClearFilters() {
    setFilterDraft({});
    setActiveFilters({});
    setFilterOpen(false);
    resetToFirstPage({ filters: {} });
  }

  function handlePrev() {
    if (cursorHistory.length <= 1) return;
    const newHistory = cursorHistory.slice(0, -1);
    const prevCursor = newHistory[newHistory.length - 1];
    setCursorHistory(newHistory);
    setSelectedIds(new Set());
    fetchWithCursor(prevCursor);
  }

  function handleNext() {
    if (!hasMore || !nextCursor) return;
    setCursorHistory((prev) => [...prev, nextCursor]);
    setSelectedIds(new Set());
    fetchWithCursor(nextCursor);
  }

  async function handleTogglePettyCash(txnId: string, currentlyPetty: boolean) {
    const action = currentlyPetty ? unmarkPettyCashAction : markAsPettyCashAction;
    const result = await action([txnId]);

    if ("error" in result) {
      toast.error(result.error);
      return;
    }

    // Update local state immediately
    setTransactions((prev) =>
      prev.map((t) =>
        t.id === txnId ? { ...t, isPettyCash: !currentlyPetty } : t
      )
    );

    toast.success(
      currentlyPetty
        ? "Removed petty cash mark"
        : "Marked as petty cash"
    );
  }

  // Selection helpers
  function toggleSelection(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function handleRowClick(e: React.MouseEvent, id: string) {
    // Don't toggle if clicking on interactive elements (checkbox, button, link, dropdown)
    const target = e.target as HTMLElement;
    if (target.closest("button, a, [data-slot=checkbox]")) return;
    toggleSelection(id);
  }

  function toggleSelectAll() {
    if (selectedIds.size === transactions.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(transactions.map((t) => t.id)));
    }
  }

  async function handleBulkMarkPettyCash() {
    setIsBulkPending(true);
    const result = await markAsPettyCashAction(Array.from(selectedIds));
    setIsBulkPending(false);
    setConfirmDialogOpen(false);

    if ("error" in result) {
      toast.error(result.error);
      return;
    }

    toast.success(`Marked ${result.count} transaction(s) as petty cash`);
    setSelectedIds(new Set());

    // Update local state
    setTransactions((prev) =>
      prev.map((t) =>
        selectedIds.has(t.id) ? { ...t, isPettyCash: true } : t
      )
    );
  }

  const allSelected = transactions.length > 0 && selectedIds.size === transactions.length;
  const someSelected = selectedIds.size > 0 && selectedIds.size < transactions.length;

  // Column definitions
  const columns: ColumnDef<Transaction>[] = [
    {
      id: "select",
      header: () => (
        <Checkbox
          checked={allSelected}
          indeterminate={someSelected}
          onCheckedChange={toggleSelectAll}
          aria-label="Select all"
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={selectedIds.has(row.original.id)}
          onCheckedChange={() => toggleSelection(row.original.id)}
          aria-label={`Select transaction ${row.original.description ?? row.original.id}`}
        />
      ),
    },
    {
      accessorKey: "date",
      header: "Date",
      cell: ({ row }) => (
        <span className="whitespace-nowrap text-sm">{row.getValue("date")}</span>
      ),
    },
    {
      accessorKey: "description",
      header: "Description",
      cell: ({ row }) => {
        const desc = (row.getValue("description") as string | null) ?? "--";
        return (
          <span className="block truncate text-sm" title={desc}>
            {desc}
          </span>
        );
      },
    },
    {
      accessorKey: "vendorName",
      header: "Vendor",
      cell: ({ row }) => {
        const vendor = row.getValue("vendorName") as string | null;
        return (
          <span className="whitespace-nowrap text-sm text-muted-foreground">
            {vendor ?? "\u2014"}
          </span>
        );
      },
    },
    {
      accessorKey: "type",
      header: "Type",
      cell: ({ row }) => {
        const type = row.getValue("type") as string;
        return (
          <Badge variant={type === "credit" ? "default" : "secondary"}>
            {type}
          </Badge>
        );
      },
    },
    {
      accessorKey: "amount",
      header: "Amount",
      cell: ({ row }) => {
        const amount = parseFloat(row.getValue("amount"));
        const type = row.original.type;
        return (
          <span
            className={`whitespace-nowrap text-sm font-mono ${type === "credit" ? "text-green-600" : "text-red-600"}`}
          >
            {type === "debit" ? "-" : "+"}
            {amount.toLocaleString("en-US", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </span>
        );
      },
    },
    {
      accessorKey: "runningBalance",
      header: "Balance",
      cell: ({ row }) => {
        const bal = row.getValue("runningBalance") as string | null;
        if (!bal) return <span className="text-sm text-muted-foreground">--</span>;
        return (
          <span className="whitespace-nowrap font-mono text-sm">
            {parseFloat(bal).toLocaleString("en-US", {
              minimumFractionDigits: 2,
            })}
          </span>
        );
      },
    },
    {
      accessorKey: "reconciliationStatus",
      header: "Status",
      cell: ({ row }) => {
        const status = row.getValue("reconciliationStatus") as string | null;
        const isPetty = row.original.isPettyCash;

        return (
          <div className="flex items-center gap-1">
            {isPetty && (
              <Badge variant="outline" className="gap-1 text-xs">
                <Coins className="size-3" />
                Petty Cash
              </Badge>
            )}
            {!isPetty && (
              <>
                {(!status || status === "unmatched") ? (
                  <Badge variant="secondary" className="text-xs">
                    Unmatched
                  </Badge>
                ) : (
                  <Badge className="text-xs">
                    {status === "matched" ? "Matched" : "Partial"}
                  </Badge>
                )}
              </>
            )}
          </div>
        );
      },
    },
    {
      id: "linkedDocs",
      header: "Documents",
      cell: ({ row }) => {
        const count = row.original.linkedDocCount;

        if (!count || count === 0) {
          return <span className="text-sm text-muted-foreground">{"\u2014"}</span>;
        }

        let docs: Array<{ docId: string; docNumber: string | null; vendorName: string | null }> = [];
        try {
          docs = typeof row.original.linkedDocs === "string"
            ? JSON.parse(row.original.linkedDocs)
            : row.original.linkedDocs ?? [];
        } catch { /* malformed JSON — fall through to empty */ }

        if (docs.length === 1) {
          const doc = docs[0];
          return (
            <Link
              href={`/documents/${doc.docId}/review`}
              className="inline-flex items-center gap-1 whitespace-nowrap text-sm text-primary hover:underline"
            >
              <FileText className="size-3.5" />
              {doc.docNumber ? `#${doc.docNumber}` : "1 Document"}
            </Link>
          );
        }

        return (
          <div className="space-y-0.5">
            {docs.map((doc) => (
              <Link
                key={doc.docId}
                href={`/documents/${doc.docId}/review`}
                className="flex items-center gap-1 text-sm text-primary hover:underline"
              >
                <FileText className="size-3 shrink-0" />
                <span className="truncate">
                  {doc.docNumber ? `#${doc.docNumber}` : doc.vendorName ?? "Document"}
                </span>
              </Link>
            ))}
          </div>
        );
      },
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => {
        const isPetty = row.original.isPettyCash ?? false;
        return (
          <DropdownMenu>
            <DropdownMenuTrigger
              className="flex size-7 items-center justify-center rounded-md hover:bg-muted"
            >
              <MoreHorizontal className="size-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                className="whitespace-nowrap"
                onClick={() =>
                  handleTogglePettyCash(row.original.id, isPetty)
                }
              >
                <Coins className="size-4" />
                {isPetty ? "Unmark Petty Cash" : "Mark as Petty Cash"}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
  ];

  const table = useReactTable({
    data: transactions,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  function exportCSV() {
    const rows = table.getRowModel().rows;
    const headers = ["Date", "Description", "Vendor", "Type", "Amount", "Balance", "Status", "Petty Cash"];
    const csvRows = [headers.join(",")];
    for (const row of rows) {
      csvRows.push(
        [
          row.original.date,
          `"${(row.original.description ?? "").replace(/"/g, '""')}"`,
          `"${(row.original.vendorName ?? "").replace(/"/g, '""')}"`,
          row.original.type,
          row.original.amount,
          row.original.runningBalance ?? "",
          row.original.reconciliationStatus ?? "unmatched",
          row.original.isPettyCash ? "Yes" : "No",
        ].join(",")
      );
    }
    const blob = new Blob([csvRows.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `transactions-${bankAccountId}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex items-center gap-2">
        <Input
          placeholder="Search transactions..."
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          onKeyDown={handleSearchKeyDown}
          className="max-w-sm flex-1"
        />
        <Button variant="outline" onClick={handleSearch} disabled={isPending}>
          {isPending ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
          Search
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            setFilterDraft(activeFilters);
            setFilterOpen(true);
          }}
        >
          <Filter className="size-4" />
          Filters
          {activeFilterCount > 0 && (
            <Badge variant="secondary" className="ml-1 size-5 justify-center rounded-full p-0 text-[10px]">
              {activeFilterCount}
            </Badge>
          )}
        </Button>
        <div className="flex-1" />

        <Button variant="outline" onClick={exportCSV}>
          <Download className="size-4" />
          CSV
        </Button>
      </div>

      {/* Floating action bar for selection */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 rounded-lg border bg-muted/50 px-4 py-2">
          <span className="text-sm font-medium">
            {selectedIds.size} selected
          </span>
          <Button
            size="sm"
            onClick={() => setConfirmDialogOpen(true)}
          >
            <Coins className="size-4" />
            Mark as Petty Cash
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSelectedIds(new Set())}
          >
            <X className="size-4" />
            Clear
          </Button>
        </div>
      )}

      {/* Table */}
      <div className="overflow-hidden rounded-md border">
        <table className="w-full table-fixed">
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id} className="border-b bg-muted/50">
                {headerGroup.headers.map((header) => {
                  // Assign widths based on column id
                  let widthClass = "";
                  switch (header.column.id) {
                    case "select": widthClass = "w-10"; break;
                    case "date": widthClass = "w-28"; break;
                    case "description": widthClass = ""; break; // fills remaining
                    case "vendorName": widthClass = "w-40"; break;
                    case "type": widthClass = "w-20"; break;
                    case "amount": widthClass = "w-32"; break;
                    case "runningBalance": widthClass = "w-32"; break;
                    case "reconciliationStatus": widthClass = "w-28"; break;
                    case "linkedDocs": widthClass = "w-32"; break;
                    case "actions": widthClass = "w-12"; break;
                  }
                  return (
                    <th
                      key={header.id}
                      className={`px-3 py-2 text-left text-xs font-medium text-muted-foreground ${widthClass}`}
                    >
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="py-8 text-center text-sm text-muted-foreground"
                >
                  <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-full bg-primary/10">
                    <Landmark className="size-6 text-primary" />
                  </div>
                  {activeSearch || activeFilterCount > 0
                    ? "No transactions match your search."
                    : "No transactions yet. Upload a bank statement to get started."}
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row) => (
                <tr
                  key={row.id}
                  className={`border-b last:border-0 transition-colors hover:bg-muted/50 ${
                    selectedIds.has(row.original.id) ? "bg-primary/5" : ""
                  }${selectedIds.size > 0 ? " cursor-pointer" : ""}`}
                  onClick={selectedIds.size > 0 ? (e) => handleRowClick(e, row.original.id) : undefined}
                >
                  {row.getVisibleCells().map((cell) => (
                    <td
                      key={cell.id}
                      className={`px-3 py-2${cell.column.id === "description" ? " max-w-0" : ""}`}
                    >
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {totalCount} transaction{totalCount !== 1 ? "s" : ""}
        </p>
        {(cursorHistory.length > 1 || hasMore) && (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={handlePrev}
              disabled={cursorHistory.length <= 1 || isPending}
            >
              <ChevronLeft className="size-4" />
            </Button>
            <span className="text-sm text-muted-foreground">
              Page {pageNumber} of {Math.max(1, Math.ceil(totalCount / PAGE_SIZE))}
            </span>
            <Button
              variant="outline"
              size="icon"
              onClick={handleNext}
              disabled={!hasMore || isPending}
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
        )}
      </div>

      {/* Filter Sheet */}
      <Sheet open={filterOpen} onOpenChange={setFilterOpen}>
        <SheetContent side="right" className="overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Filter Transactions</SheetTitle>
          </SheetHeader>
          <div className="space-y-4 px-4">
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select
                value={filterDraft.type ?? ""}
                onValueChange={(val) =>
                  setFilterDraft((d) => ({
                    ...d,
                    type: (val || undefined) as TransactionSearchFilters["type"],
                  }))
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="All types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All types</SelectItem>
                  <SelectItem value="debit">Debit</SelectItem>
                  <SelectItem value="credit">Credit</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Reconciliation Status</Label>
              <Select
                value={filterDraft.reconciliationStatus ?? ""}
                onValueChange={(val) =>
                  setFilterDraft((d) => ({
                    ...d,
                    reconciliationStatus: (val || undefined) as TransactionSearchFilters["reconciliationStatus"],
                  }))
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All statuses</SelectItem>
                  <SelectItem value="unmatched">Unmatched</SelectItem>
                  <SelectItem value="matched">Matched</SelectItem>
                  <SelectItem value="partially_matched">Partially matched</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label>Date from</Label>
                <Input
                  type="date"
                  value={filterDraft.dateFrom ?? ""}
                  onChange={(e) =>
                    setFilterDraft((d) => ({ ...d, dateFrom: e.target.value || undefined }))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label>Date to</Label>
                <Input
                  type="date"
                  value={filterDraft.dateTo ?? ""}
                  onChange={(e) =>
                    setFilterDraft((d) => ({ ...d, dateTo: e.target.value || undefined }))
                  }
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label>Amount min</Label>
                <Input
                  type="number"
                  placeholder="0.00"
                  value={filterDraft.amountMin ?? ""}
                  onChange={(e) =>
                    setFilterDraft((d) => ({ ...d, amountMin: e.target.value || undefined }))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label>Amount max</Label>
                <Input
                  type="number"
                  placeholder="0.00"
                  value={filterDraft.amountMax ?? ""}
                  onChange={(e) =>
                    setFilterDraft((d) => ({ ...d, amountMax: e.target.value || undefined }))
                  }
                />
              </div>
            </div>
          </div>

          <SheetFooter>
            <Button variant="outline" onClick={handleClearFilters}>
              <X className="size-4" />
              Clear
            </Button>
            <Button onClick={handleApplyFilters}>
              Apply Filters
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* Bulk petty cash confirmation dialog */}
      <Dialog open={confirmDialogOpen} onOpenChange={setConfirmDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark as Petty Cash</DialogTitle>
            <DialogDescription>
              This will mark {selectedIds.size} transaction{selectedIds.size !== 1 ? "s" : ""} as petty cash.
              Petty cash transactions are excluded from reconciliation matching.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmDialogOpen(false)}
              disabled={isBulkPending}
            >
              Cancel
            </Button>
            <Button
              onClick={handleBulkMarkPettyCash}
              disabled={isBulkPending}
            >
              {isBulkPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Coins className="size-4" />
              )}
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
