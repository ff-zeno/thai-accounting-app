"use client";

import { useState, useTransition, useCallback, useEffect } from "react";
import { useTranslations } from "next-intl";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { getDocumentSummaryAction } from "../dashboard/actions";
import type { SummaryRow } from "@/lib/db/queries/dashboard";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface VendorOption {
  id: string;
  name: string;
}

interface Props {
  initialExpenseRows: SummaryRow[];
  initialIncomeRows: SummaryRow[];
  initialVendorNames: Record<string, string>;
  vendorOptions: VendorOption[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatThb(value: string): string {
  const num = parseFloat(value);
  if (isNaN(num)) return "0.00";
  return num.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function computeTotals(rows: SummaryRow[]) {
  let totalPreVat = 0;
  let totalVat = 0;
  let totalWht = 0;
  let netPaid = 0;
  let documentCount = 0;

  for (const row of rows) {
    documentCount += row.documentCount;
    totalPreVat += parseFloat(row.totalPreVat);
    totalVat += parseFloat(row.totalVat);
    totalWht += parseFloat(row.totalWht);
    netPaid += parseFloat(row.netPaid);
  }

  return {
    documentCount,
    totalPreVat: totalPreVat.toFixed(2),
    totalVat: totalVat.toFixed(2),
    totalWht: totalWht.toFixed(2),
    netPaid: netPaid.toFixed(2),
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SummaryView({
  initialExpenseRows,
  initialIncomeRows,
  initialVendorNames,
  vendorOptions,
}: Props) {
  const t = useTranslations("reports");

  const [direction, setDirection] = useState<"expense" | "income">("expense");
  const [groupBy, setGroupBy] = useState<"month" | "vendor" | "payment_type">("month");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [vendorId, setVendorId] = useState("");
  const [isPending, startTransition] = useTransition();

  const [expenseRows, setExpenseRows] = useState(initialExpenseRows);
  const [incomeRows, setIncomeRows] = useState(initialIncomeRows);
  const [vendorNames, setVendorNames] = useState(initialVendorNames);

  const rows = direction === "expense" ? expenseRows : incomeRows;
  const totals = computeTotals(rows);

  const fetchData = useCallback(
    (
      dir: "expense" | "income",
      group: "month" | "vendor" | "payment_type",
      filters: { dateFrom?: string; dateTo?: string; vendorId?: string }
    ) => {
      startTransition(async () => {
        const result = await getDocumentSummaryAction(dir, group, {
          dateFrom: filters.dateFrom || undefined,
          dateTo: filters.dateTo || undefined,
          vendorId: filters.vendorId || undefined,
        });

        if (dir === "expense") {
          setExpenseRows(result.rows);
        } else {
          setIncomeRows(result.rows);
        }

        if (group === "vendor" && Object.keys(result.vendorNames).length > 0) {
          setVendorNames((prev) => ({ ...prev, ...result.vendorNames }));
        }
      });
    },
    []
  );

  // Re-fetch when filters change
  useEffect(() => {
    fetchData(direction, groupBy, { dateFrom, dateTo, vendorId });
  }, [direction, groupBy, dateFrom, dateTo, vendorId, fetchData]);

  function getRowLabel(row: SummaryRow): string {
    if (groupBy === "vendor") {
      if (row.groupKey === "unassigned") return t("unassigned");
      return vendorNames[row.groupKey] ?? row.groupKey;
    }
    if (groupBy === "payment_type") {
      if (row.groupKey === "uncategorized") return t("uncategorized");
      return row.groupKey;
    }
    return row.groupLabel;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("summaryView")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Direction tabs */}
        <Tabs
          defaultValue="expense"
          onValueChange={(val) => {
            if (val === "expense" || val === "income") setDirection(val);
          }}
        >
          <TabsList>
            <TabsTrigger value="expense">
              {t("expense")}
            </TabsTrigger>
            <TabsTrigger value="income">{t("income")}</TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Filters row */}
        <div className="flex flex-wrap items-end gap-3">
          {/* Group By */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">
              {t("groupBy")}
            </label>
            <Select
              value={groupBy}
              onValueChange={(val) => {
                if (val) setGroupBy(val as "month" | "vendor" | "payment_type");
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="month">{t("month")}</SelectItem>
                <SelectItem value="vendor">{t("vendor")}</SelectItem>
                <SelectItem value="payment_type">{t("paymentType")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Date From */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">
              {t("dateFrom")}
            </label>
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="h-8 w-36"
            />
          </div>

          {/* Date To */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">
              {t("dateTo")}
            </label>
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="h-8 w-36"
            />
          </div>

          {/* Vendor filter */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">
              {t("vendor")}
            </label>
            <Select
              value={vendorId}
              onValueChange={(val) => setVendorId(val ?? "")}
            >
              <SelectTrigger>
                <SelectValue placeholder={t("allVendors")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">{t("allVendors")}</SelectItem>
                {vendorOptions.map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {isPending && (
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          )}
        </div>

        {/* Summary table */}
        {rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {t("noData")}
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>
                  {groupBy === "month"
                    ? t("month")
                    : groupBy === "vendor"
                      ? t("vendor")
                      : t("paymentType")}
                </TableHead>
                <TableHead className="text-right">{t("documentCount")}</TableHead>
                <TableHead className="text-right">{t("totalPreVat")}</TableHead>
                <TableHead className="text-right">{t("totalVat")}</TableHead>
                <TableHead className="text-right">{t("totalWht")}</TableHead>
                <TableHead className="text-right">{t("netPaid")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row, i) => (
                <TableRow key={`${row.groupKey}-${i}`}>
                  <TableCell className="font-medium">
                    {getRowLabel(row)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Badge variant="secondary">{row.documentCount}</Badge>
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {formatThb(row.totalPreVat)}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {formatThb(row.totalVat)}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {formatThb(row.totalWht)}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {formatThb(row.netPaid)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell className="font-bold">{t("totals")}</TableCell>
                <TableCell className="text-right font-bold">
                  {totals.documentCount}
                </TableCell>
                <TableCell className="text-right font-mono font-bold">
                  {formatThb(totals.totalPreVat)}
                </TableCell>
                <TableCell className="text-right font-mono font-bold">
                  {formatThb(totals.totalVat)}
                </TableCell>
                <TableCell className="text-right font-mono font-bold">
                  {formatThb(totals.totalWht)}
                </TableCell>
                <TableCell className="text-right font-mono font-bold">
                  {formatThb(totals.netPaid)}
                </TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
