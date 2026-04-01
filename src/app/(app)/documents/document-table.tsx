"use client";

import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  type ColumnDef,
} from "@tanstack/react-table";
import {
  useState,
  useTransition,
  useCallback,
  useEffect,
  useRef,
} from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowUpDown,
  Filter,
  Loader2,
  FileText,
  Paperclip,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  searchDocumentsAction,
  updateDocumentSidebarAction,
  getDocumentDetailsAction,
  confirmDocumentSidebarAction,
  getPendingPipelineCountAction,
  bulkDeleteDocumentsAction,
} from "./actions";
import { retryExtractionAction } from "./[docId]/review/actions";
import { DocumentDetailSidebar } from "./document-detail-sidebar";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DocumentRow {
  id: string;
  type: string;
  documentNumber: string | null;
  issueDate: string | null;
  dueDate: string | null;
  subtotal: string | null;
  vatAmount: string | null;
  totalAmount: string | null;
  currency: string | null;
  category: string | null;
  status: string;
  needsReview: boolean | null;
  aiConfidence: string | null;
  createdAt: Date;
  vendorId: string | null;
  vendorName: string | null;
  vendorNameTh: string | null;
  vendorDisplayAlias: string | null;
  fileCount: number;
  maxWhtRate: string | null;
  reconMatchCount: number;
  reconMatchedTotal: string | null;
  pipelineStatus: string | null;
}

export interface FilterOptions {
  categories: string[];
  vendors: { id: string; name: string }[];
}

interface Props {
  direction: "expense" | "income";
  initialDocuments: DocumentRow[];
  initialHasMore: boolean;
  initialNextCursor: { issueDate: string | null; id: string } | null;
  filterOptions: FilterOptions;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ReconBadge({
  matchCount,
  matchedTotal,
  totalAmount,
}: {
  matchCount: number;
  matchedTotal: string | null;
  totalAmount: string | null;
}) {
  const t = useTranslations("documents");

  if (matchCount === 0) {
    return (
      <Badge variant="secondary" className="text-xs">
        {t("unmatched")}
      </Badge>
    );
  }

  const matched = parseFloat(matchedTotal || "0");
  const total = parseFloat(totalAmount || "0");
  const isFullMatch = total > 0 && Math.abs(matched - total) < 0.01;

  return (
    <Badge variant={isFullMatch ? "default" : "outline"} className="text-xs">
      {isFullMatch ? t("matched") : t("partial")}
    </Badge>
  );
}

function StatusBadge({
  status,
  needsReview,
}: {
  status: string;
  needsReview: boolean | null;
}) {
  const t = useTranslations("documents");

  if (status === "draft" && needsReview) {
    return <Badge variant="secondary">{t("needsReview")}</Badge>;
  }
  if (status === "confirmed") {
    return <Badge variant="default">{t("confirmed")}</Badge>;
  }
  if (status === "voided") {
    return <Badge variant="destructive">{t("voided")}</Badge>;
  }
  return <Badge variant="outline">{status}</Badge>;
}

function PipelineBadge({ status }: { status: string | null }) {
  if (!status || status === "completed") return null;

  const isProcessing = ["uploaded", "extracting", "validating", "validated"].includes(status);
  const isFailed = status.startsWith("failed_");

  if (isProcessing) {
    return (
      <Badge variant="secondary" className="gap-1 text-xs">
        <Loader2 className="size-3 animate-spin" />
        {status === "uploaded" ? "Queued" : status === "extracting" ? "Extracting" : status === "validating" ? "Validating" : "Validated"}
      </Badge>
    );
  }

  if (isFailed) {
    return (
      <Badge variant="destructive" className="text-xs">
        {status === "failed_extraction" ? "Extraction Failed" : "Validation Failed"}
      </Badge>
    );
  }

  return null;
}

// ---------------------------------------------------------------------------
// Filter Panel
// ---------------------------------------------------------------------------

interface ActiveFilters {
  categories: string[];
  vendorIds: string[];
  statuses: string[];
  dateFrom: string;
  dateTo: string;
}

const EMPTY_FILTERS: ActiveFilters = {
  categories: [],
  vendorIds: [],
  statuses: [],
  dateFrom: "",
  dateTo: "",
};

function FilterPanel({
  options,
  filters,
  onChange,
  onApply,
  onClear,
  onClose,
}: {
  options: FilterOptions;
  filters: ActiveFilters;
  onChange: (f: ActiveFilters) => void;
  onApply: () => void;
  onClear: () => void;
  onClose: () => void;
}) {
  const t = useTranslations("documents");
  const tc = useTranslations("common");

  const toggleArray = (arr: string[], val: string) =>
    arr.includes(val) ? arr.filter((v) => v !== val) : [...arr, val];

  const statuses = ["draft", "confirmed", "partially_paid", "paid", "voided"];

  return (
    <div className="absolute right-0 top-full z-50 mt-1 w-80 rounded-lg border bg-popover p-3 shadow-md">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-medium">{t("filters")}</span>
        <Button variant="ghost" size="icon-sm" onClick={onClose}>
          <X className="size-4" />
        </Button>
      </div>

      {/* Status */}
      <div className="mb-3">
        <div className="mb-1 text-xs font-medium text-muted-foreground">
          {tc("status")}
        </div>
        <div className="flex flex-wrap gap-1">
          {statuses.map((s) => (
            <Badge
              key={s}
              variant={filters.statuses.includes(s) ? "default" : "outline"}
              className="cursor-pointer text-xs"
              onClick={() =>
                onChange({ ...filters, statuses: toggleArray(filters.statuses, s) })
              }
            >
              {s === "partially_paid" ? t("partiallyPaid") : t(s as "draft" | "paid" | "voided")}
            </Badge>
          ))}
        </div>
      </div>

      {/* Categories */}
      {options.categories.length > 0 && (
        <div className="mb-3">
          <div className="mb-1 text-xs font-medium text-muted-foreground">
            {t("category")}
          </div>
          <div className="flex flex-wrap gap-1">
            {options.categories.map((c) => (
              <Badge
                key={c}
                variant={filters.categories.includes(c) ? "default" : "outline"}
                className="cursor-pointer text-xs"
                onClick={() =>
                  onChange({
                    ...filters,
                    categories: toggleArray(filters.categories, c),
                  })
                }
              >
                {c}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Vendors */}
      {options.vendors.length > 0 && (
        <div className="mb-3">
          <div className="mb-1 text-xs font-medium text-muted-foreground">
            {t("vendor")}
          </div>
          <div className="flex max-h-32 flex-wrap gap-1 overflow-y-auto">
            {options.vendors.map((v) => (
              <Badge
                key={v.id}
                variant={
                  filters.vendorIds.includes(v.id) ? "default" : "outline"
                }
                className="cursor-pointer text-xs"
                onClick={() =>
                  onChange({
                    ...filters,
                    vendorIds: toggleArray(filters.vendorIds, v.id),
                  })
                }
              >
                {v.name}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Date Range */}
      <div className="mb-3">
        <div className="mb-1 text-xs font-medium text-muted-foreground">
          {t("dateRange")}
        </div>
        <div className="flex gap-2">
          <Input
            type="date"
            value={filters.dateFrom}
            onChange={(e) =>
              onChange({ ...filters, dateFrom: e.target.value })
            }
            className="h-8 text-xs"
            placeholder={t("from")}
          />
          <Input
            type="date"
            value={filters.dateTo}
            onChange={(e) =>
              onChange({ ...filters, dateTo: e.target.value })
            }
            className="h-8 text-xs"
            placeholder={t("to")}
          />
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <Button size="sm" onClick={onApply} className="flex-1">
          {t("applyFilters")}
        </Button>
        <Button size="sm" variant="outline" onClick={onClear}>
          {t("clearFilters")}
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function DocumentTable({
  direction,
  initialDocuments,
  initialHasMore,
  initialNextCursor,
  filterOptions,
}: Props) {
  const t = useTranslations("documents");
  const tc = useTranslations("common");
  const router = useRouter();

  const [documents, setDocuments] = useState(initialDocuments);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [nextCursor, setNextCursor] = useState(initialNextCursor);
  const [isPending, startTransition] = useTransition();
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [pendingFilters, setPendingFilters] = useState<ActiveFilters>(EMPTY_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState<ActiveFilters>(EMPTY_FILTERS);
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [attachDocId, setAttachDocId] = useState<string | null>(null);

  // Selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);

  useEffect(() => {
    setDocuments(initialDocuments);
    setHasMore(initialHasMore);
    setNextCursor(initialNextCursor);
  }, [initialDocuments, initialHasMore, initialNextCursor]);

  // Pipeline status polling: check every 5s if any docs are still processing
  const lastPendingCountRef = useRef<number | null>(null);

  useEffect(() => {
    // Check if any documents are currently in a processing state
    const hasProcessing = documents.some(
      (d) =>
        d.pipelineStatus &&
        !["completed", "failed_extraction", "failed_validation"].includes(
          d.pipelineStatus
        )
    );

    if (!hasProcessing) {
      lastPendingCountRef.current = null;
      return;
    }

    const interval = setInterval(async () => {
      const pendingCount = await getPendingPipelineCountAction(direction);

      if (
        lastPendingCountRef.current !== null &&
        pendingCount !== lastPendingCountRef.current
      ) {
        // Status changed -- refresh server data
        router.refresh();
      }

      lastPendingCountRef.current = pendingCount;

      // Stop polling when nothing is pending
      if (pendingCount === 0) {
        clearInterval(interval);
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [documents, direction, router]);

  // Retry extraction for failed documents
  async function handleRetry(docId: string) {
    try {
      await retryExtractionAction(docId);
      toast.success("Retrying extraction...");
      router.refresh();
    } catch {
      toast.error("Retry failed");
    }
  }

  const activeFilterCount =
    appliedFilters.categories.length +
    appliedFilters.vendorIds.length +
    appliedFilters.statuses.length +
    (appliedFilters.dateFrom ? 1 : 0) +
    (appliedFilters.dateTo ? 1 : 0);

  // Execute search with current filters
  const executeSearch = useCallback(
    (search: string, filters: ActiveFilters) => {
      setSelectedIds(new Set());
      startTransition(async () => {
        const result = await searchDocumentsAction(direction, {
          search: search || undefined,
          categories:
            filters.categories.length > 0 ? filters.categories : undefined,
          vendorIds:
            filters.vendorIds.length > 0 ? filters.vendorIds : undefined,
          statuses:
            filters.statuses.length > 0
              ? (filters.statuses as ("draft" | "confirmed" | "partially_paid" | "paid" | "voided")[])
              : undefined,
          dateFrom: filters.dateFrom || undefined,
          dateTo: filters.dateTo || undefined,
        });
        setDocuments(result.data as DocumentRow[]);
        setHasMore(result.hasMore);
        setNextCursor(result.nextCursor);
      });
    },
    [direction, startTransition]
  );

  // Debounced search
  const handleSearch = useCallback(
    (query: string) => {
      setSearchQuery(query);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        executeSearch(query, appliedFilters);
      }, 300);
    },
    [executeSearch, appliedFilters]
  );

  // Apply filters
  function handleApplyFilters() {
    setAppliedFilters(pendingFilters);
    setShowFilters(false);
    executeSearch(searchQuery, pendingFilters);
  }

  function handleClearFilters() {
    setPendingFilters(EMPTY_FILTERS);
    setAppliedFilters(EMPTY_FILTERS);
    setShowFilters(false);
    executeSearch(searchQuery, EMPTY_FILTERS);
  }

  // Load more
  function handleLoadMore() {
    if (!nextCursor || isLoadingMore) return;
    setIsLoadingMore(true);
    startTransition(async () => {
      const result = await searchDocumentsAction(
        direction,
        {
          search: searchQuery || undefined,
          categories:
            appliedFilters.categories.length > 0
              ? appliedFilters.categories
              : undefined,
          vendorIds:
            appliedFilters.vendorIds.length > 0
              ? appliedFilters.vendorIds
              : undefined,
          statuses:
            appliedFilters.statuses.length > 0
              ? (appliedFilters.statuses as ("draft" | "confirmed" | "partially_paid" | "paid" | "voided")[])
              : undefined,
          dateFrom: appliedFilters.dateFrom || undefined,
          dateTo: appliedFilters.dateTo || undefined,
        },
        nextCursor
      );
      setDocuments((prev) => [...prev, ...(result.data as DocumentRow[])]);
      setHasMore(result.hasMore);
      setNextCursor(result.nextCursor);
      setIsLoadingMore(false);
    });
  }

  // File attach
  function handleAttachClick(docId: string) {
    setAttachDocId(docId);
    fileInputRef.current?.click();
  }

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !attachDocId) return;

    // File is selected — for now we just refresh. Full upload via storage
    // would need a separate implementation with FormData.
    // Reset the input for next use
    e.target.value = "";
    setAttachDocId(null);
  }

  // Selection helpers
  function toggleSelection(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selectedIds.size === documents.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(documents.map((d) => d.id)));
    }
  }

  function handleRowClick(e: React.MouseEvent, id: string) {
    const target = e.target as HTMLElement;
    if (target.closest("button, a, [data-slot=checkbox]")) return;
    if (selectedIds.size > 0) {
      toggleSelection(id);
    } else {
      setSelectedDocId(id);
    }
  }

  async function handleBulkDelete() {
    setIsBulkDeleting(true);
    const result = await bulkDeleteDocumentsAction(Array.from(selectedIds));
    setIsBulkDeleting(false);
    setConfirmDeleteOpen(false);

    if ("error" in result) {
      toast.error(result.error);
      return;
    }

    toast.success(`Deleted ${result.count} document${result.count !== 1 ? "s" : ""}`);

    // Remove deleted docs from local state
    setDocuments((prev) => prev.filter((d) => !selectedIds.has(d.id)));
    setSelectedIds(new Set());
  }

  const allSelected = documents.length > 0 && selectedIds.size === documents.length;
  const someSelected = selectedIds.size > 0 && selectedIds.size < documents.length;

  // Column definitions
  const columns: ColumnDef<DocumentRow>[] = [
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
          aria-label={`Select document ${row.original.documentNumber ?? row.original.id}`}
        />
      ),
    },
    {
      accessorKey: "issueDate",
      header: () => (
        <span className="whitespace-nowrap text-xs">{t("issueDate")}</span>
      ),
      cell: ({ row }) => (
        <span className="whitespace-nowrap text-sm">
          {row.original.issueDate || "—"}
        </span>
      ),
    },
    {
      id: "vendor",
      header: () => <span className="text-xs">{t("vendor")}</span>,
      cell: ({ row }) => (
        <span className="line-clamp-1 max-w-[200px] text-sm">
          {row.original.vendorDisplayAlias ||
            row.original.vendorName ||
            row.original.vendorNameTh ||
            "—"}
        </span>
      ),
    },
    {
      accessorKey: "documentNumber",
      header: () => (
        <span className="whitespace-nowrap text-xs">{t("documentNumber")}</span>
      ),
      cell: ({ row }) => (
        <span className="text-sm">{row.original.documentNumber || "—"}</span>
      ),
    },
    {
      accessorKey: "type",
      header: () => <span className="text-xs">{t("type")}</span>,
      cell: ({ row }) => (
        <Badge variant="outline" className="text-xs capitalize">
          {row.original.type.replace("_", " ")}
        </Badge>
      ),
    },
    {
      accessorKey: "category",
      header: () => <span className="text-xs">{t("category")}</span>,
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {row.original.category || "—"}
        </span>
      ),
    },
    {
      accessorKey: "totalAmount",
      header: () => (
        <span className="whitespace-nowrap text-xs">{t("totalAmount")}</span>
      ),
      cell: ({ row }) => (
        <span className="whitespace-nowrap text-right font-mono text-sm">
          {row.original.totalAmount
            ? `${parseFloat(row.original.totalAmount).toLocaleString(undefined, {
                minimumFractionDigits: 2,
              })} ${row.original.currency || "THB"}`
            : "—"}
        </span>
      ),
    },
    {
      accessorKey: "vatAmount",
      header: () => (
        <span className="whitespace-nowrap text-xs">{t("vatAmount")}</span>
      ),
      cell: ({ row }) => (
        <span className="whitespace-nowrap text-right font-mono text-sm">
          {row.original.vatAmount
            ? parseFloat(row.original.vatAmount).toLocaleString(undefined, {
                minimumFractionDigits: 2,
              })
            : "—"}
        </span>
      ),
    },
    {
      id: "whtRate",
      header: () => (
        <span className="whitespace-nowrap text-xs">{t("whtRate")}</span>
      ),
      cell: ({ row }) => (
        <span className="text-sm">
          {row.original.maxWhtRate
            ? `${(parseFloat(row.original.maxWhtRate) * 100).toFixed(0)}%`
            : "—"}
        </span>
      ),
    },
    {
      id: "pipelineStatus",
      header: () => null,
      cell: ({ row }) => (
        <PipelineBadge status={row.original.pipelineStatus} />
      ),
    },
    {
      id: "reconciliation",
      header: () => (
        <span className="whitespace-nowrap text-xs">
          {t("reconciliation")}
        </span>
      ),
      cell: ({ row }) => (
        <ReconBadge
          matchCount={row.original.reconMatchCount}
          matchedTotal={row.original.reconMatchedTotal}
          totalAmount={row.original.totalAmount}
        />
      ),
    },
    {
      id: "files",
      header: () => null,
      cell: ({ row }) =>
        row.original.fileCount > 0 ? (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Paperclip className="size-3" />
            {row.original.fileCount}
          </span>
        ) : null,
    },
    {
      id: "actions",
      header: () => null,
      cell: ({ row }) => {
        const ps = row.original.pipelineStatus;
        const isFailed = ps === "failed_extraction" || ps === "failed_validation";

        return (
          <div className="flex items-center gap-1">
            {isFailed && (
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={(e) => {
                  e.stopPropagation();
                  handleRetry(row.original.id);
                }}
                title={tc("retry")}
              >
                <RefreshCw className="size-3.5" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={(e) => {
                e.stopPropagation();
                handleAttachClick(row.original.id);
              }}
              title={t("attachFile")}
            >
              <Plus className="size-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={(e) => {
                e.stopPropagation();
                setSelectedDocId(row.original.id);
              }}
              title={t("review")}
            >
              <Pencil className="size-3.5" />
            </Button>
          </div>
        );
      },
    },
  ];

  const table = useReactTable({
    data: documents,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <div className="space-y-3">
      {/* Search & Filter Bar */}
      <div className="flex items-center gap-2">
        <div className="relative max-w-sm flex-1">
          <Input
            placeholder={`${t("vendor")}, ${t("documentNumber")}...`}
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
            className="pr-8"
          />
          {isPending && !isLoadingMore && (
            <Loader2 className="absolute right-2.5 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
          )}
        </div>
        <div className="relative">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setPendingFilters(appliedFilters);
              setShowFilters(!showFilters);
            }}
          >
            <Filter className="mr-1 size-4" />
            {t("filters")}
            {activeFilterCount > 0 && (
              <Badge variant="default" className="ml-1 px-1.5 py-0 text-xs">
                {activeFilterCount}
              </Badge>
            )}
          </Button>
          {showFilters && (
            <FilterPanel
              options={filterOptions}
              filters={pendingFilters}
              onChange={setPendingFilters}
              onApply={handleApplyFilters}
              onClear={handleClearFilters}
              onClose={() => setShowFilters(false)}
            />
          )}
        </div>
      </div>

      {/* Floating action bar for selection */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 rounded-lg border bg-muted/50 px-4 py-2">
          <span className="text-sm font-medium">
            {selectedIds.size} selected
          </span>
          <Button
            size="sm"
            variant="destructive"
            onClick={() => setConfirmDeleteOpen(true)}
          >
            <Trash2 className="size-4" />
            {tc("delete")}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSelectedIds(new Set())}
          >
            <X className="size-4" />
            {tc("clear")}
          </Button>
        </div>
      )}

      {/* Table */}
      <div className="rounded-md border">
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
                    <FileText className="size-6 text-primary" />
                  </div>
                  {searchQuery || activeFilterCount > 0
                    ? t("noMatchSearch")
                    : t("noDocuments")}
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row) => (
                <tr
                  key={row.id}
                  className={`cursor-pointer border-b last:border-0 transition-colors hover:bg-muted/50 ${
                    selectedIds.has(row.original.id) ? "bg-primary/5" : ""
                  }`}
                  onClick={(e) => handleRowClick(e, row.original.id)}
                >
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
          {documents.length} document{documents.length !== 1 ? "s" : ""}
          {hasMore ? "+" : ""} shown
        </p>
        {hasMore && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleLoadMore}
            disabled={isPending}
          >
            {isLoadingMore ? (
              <>
                <Loader2 className="mr-1 size-4 animate-spin" />
                {t("loadMore")}...
              </>
            ) : (
              t("loadMore")
            )}
          </Button>
        )}
      </div>

      {/* Hidden file input for attaching */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".jpg,.jpeg,.png,.pdf"
        className="hidden"
        onChange={handleFileSelected}
      />

      {/* Document Detail Sidebar */}
      <DocumentDetailSidebar
        docId={selectedDocId}
        open={selectedDocId !== null}
        onClose={() => setSelectedDocId(null)}
        onSave={async (docId, data) => {
          const result = await updateDocumentSidebarAction(docId, data);
          if ("success" in result) {
            // Refresh the list
            executeSearch(searchQuery, appliedFilters);
          }
          return result;
        }}
        onConfirm={async (docId) => {
          const result = await confirmDocumentSidebarAction(docId);
          if ("success" in result) {
            executeSearch(searchQuery, appliedFilters);
          }
          return result;
        }}
      />

      {/* Bulk delete confirmation dialog */}
      <Dialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("deleteDocuments")}</DialogTitle>
            <DialogDescription>
              {t("deleteDocumentsConfirm", { count: selectedIds.size })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmDeleteOpen(false)}
              disabled={isBulkDeleting}
            >
              {tc("cancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={handleBulkDelete}
              disabled={isBulkDeleting}
            >
              {isBulkDeleting ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Trash2 className="size-4" />
              )}
              {tc("delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
