"use client";

import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import { useState } from "react";
import { ArrowUpDown, Download } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Transaction {
  id: string;
  date: string;
  description: string | null;
  amount: string;
  type: string;
  runningBalance: string | null;
  referenceNo: string | null;
  counterparty: string | null;
  reconciliationStatus: string | null;
}

const columns: ColumnDef<Transaction>[] = [
  {
    accessorKey: "date",
    header: ({ column }) => (
      <Button
        variant="ghost"
        size="sm"
        className="-ml-3 h-8"
        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
      >
        Date
        <ArrowUpDown className="ml-1 size-3" />
      </Button>
    ),
    cell: ({ row }) => (
      <span className="whitespace-nowrap text-sm">{row.getValue("date")}</span>
    ),
  },
  {
    accessorKey: "description",
    header: "Description",
    cell: ({ row }) => (
      <span className="line-clamp-1 max-w-[300px] text-sm">
        {row.getValue("description") ?? "—"}
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
    header: ({ column }) => (
      <Button
        variant="ghost"
        size="sm"
        className="-ml-3 h-8"
        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
      >
        Amount
        <ArrowUpDown className="ml-1 size-3" />
      </Button>
    ),
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
      if (!bal) return <span className="text-sm text-muted-foreground">—</span>;
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
      if (!status || status === "unmatched")
        return (
          <Badge variant="secondary" className="text-xs">
            Unmatched
          </Badge>
        );
      return (
        <Badge className="text-xs">
          {status === "matched" ? "Matched" : "Partial"}
        </Badge>
      );
    },
  },
];

export function TransactionTable({
  transactions,
  hasMore,
  bankAccountId,
}: {
  transactions: Transaction[];
  hasMore: boolean;
  bankAccountId: string;
}) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState("");

  const table = useReactTable({
    data: transactions,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    state: { sorting, globalFilter },
  });

  function exportCSV() {
    const rows = table.getFilteredRowModel().rows;
    const headers = ["Date", "Description", "Type", "Amount", "Balance", "Status"];
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
      <div className="flex items-center gap-2">
        <Input
          placeholder="Search transactions..."
          value={globalFilter}
          onChange={(e) => setGlobalFilter(e.target.value)}
          className="max-w-sm"
        />
        <Button variant="outline" size="sm" onClick={exportCSV}>
          <Download className="mr-1 size-4" />
          CSV
        </Button>
      </div>

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
                  No transactions yet. Upload a bank statement to get started.
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row) => (
                <tr key={row.id} className="border-b last:border-0">
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

      {hasMore && (
        <p className="text-center text-sm text-muted-foreground">
          Showing first 50 transactions. More available.
        </p>
      )}
    </div>
  );
}
