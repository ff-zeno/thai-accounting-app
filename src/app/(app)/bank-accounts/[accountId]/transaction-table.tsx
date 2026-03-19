"use client";

import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  type ColumnDef,
} from "@tanstack/react-table";
import { useState, useCallback, useTransition } from "react";
import { toast } from "sonner";
import {
  ChevronLeft,
  ChevronRight,
  Coins,
  Download,
  Filter,
  Landmark,
  Loader2,
  MoreHorizontal,
  Search,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  paginateTransactionsAction,
  markAsPettyCashAction,
  unmarkPettyCashAction,
  bulkMarkPettyCashBelowThresholdAction,
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

  // Bulk petty cash threshold
  const [bulkThreshold, setBulkThreshold] = useState("2000");
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
    fetchWithCursor(prevCursor);
  }

  function handleNext() {
    if (!hasMore || !nextCursor) return;
    setCursorHistory((prev) => [...prev, nextCursor]);
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

  async function handleBulkMarkPettyCash() {
    setIsBulkPending(true);
    const result = await bulkMarkPettyCashBelowThresholdAction(
      bankAccountId,
      bulkThreshold
    );
    setIsBulkPending(false);

    if ("error" in result) {
      toast.error(result.error);
      return;
    }

    toast.success(`Marked ${result.count} transaction(s) as petty cash`);
    resetToFirstPage();
  }

  // Column definitions
  const columns: ColumnDef<Transaction>[] = [
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
      cell: ({ row }) => (
        <span className="line-clamp-1 max-w-[300px] text-sm">
          {row.getValue("description") ?? "--"}
        </span>
      ),
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
    const headers = ["Date", "Description", "Type", "Amount", "Balance", "Status", "Petty Cash"];
    const csvRows = [headers.join(",")];
    for (const row of rows) {
      csvRows.push(
        [
          row.original.date,
          `"${(row.original.description ?? "").replace(/"/g, '""')}"`,
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

        {/* Bulk Petty Cash */}
        <div className="flex items-center gap-1.5">
          <Input
            type="number"
            value={bulkThreshold}
            onChange={(e) => setBulkThreshold(e.target.value)}
            className="w-24"
            placeholder="2000"
          />
          <Button
            variant="outline"
            size="sm"
            onClick={handleBulkMarkPettyCash}
            disabled={isBulkPending}
          >
            {isBulkPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Coins className="size-4" />
            )}
            Bulk Petty Cash
          </Button>
        </div>

        <Button variant="outline" onClick={exportCSV}>
          <Download className="size-4" />
          CSV
        </Button>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-md border">
        <table className="w-full">
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id} className="border-b bg-muted/50">
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    className="px-3 py-2 text-left text-xs font-medium text-muted-foreground"
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                  </th>
                ))}
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
                <tr key={row.id} className="border-b last:border-0 transition-colors hover:bg-muted/50">
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-3 py-2">
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
    </div>
  );
}
