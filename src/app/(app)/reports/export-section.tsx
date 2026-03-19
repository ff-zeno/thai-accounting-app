"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Download, FileSpreadsheet, Database, Loader2 } from "lucide-react";
import {
  exportFlowAccountAction,
  exportPeakAction,
  exportFullDataAction,
} from "./actions";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function triggerDownload(content: string, filename: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function triggerJsonDownload(content: string, filename: string) {
  const blob = new Blob([content], {
    type: "application/json;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Default date range: current month
// ---------------------------------------------------------------------------

function getDefaultDateRange() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const lastDay = new Date(year, now.getMonth() + 1, 0).getDate();
  return {
    from: `${year}-${month}-01`,
    to: `${year}-${month}-${String(lastDay).padStart(2, "0")}`,
  };
}

// ---------------------------------------------------------------------------
// Export Card component for FlowAccount and Peak
// ---------------------------------------------------------------------------

type Direction = "expense" | "income" | "all";

function AccountingExportCard({
  title,
  description,
  icon: Icon,
  onExport,
}: {
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  onExport: (
    dateFrom: string,
    dateTo: string,
    direction: Direction
  ) => Promise<void>;
}) {
  const t = useTranslations("reports");
  const defaults = getDefaultDateRange();
  const [dateFrom, setDateFrom] = useState(defaults.from);
  const [dateTo, setDateTo] = useState(defaults.to);
  const [direction, setDirection] = useState<Direction>("all");
  const [isPending, startTransition] = useTransition();

  function handleExport() {
    startTransition(async () => {
      await onExport(dateFrom, dateTo, direction);
    });
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Icon className="size-5 text-primary" />
          <CardTitle>{title}</CardTitle>
        </div>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-end gap-3">
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
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">
              {t("directionFilter")}
            </label>
            <Select
              value={direction}
              onValueChange={(val) => setDirection(val as Direction)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("allDirections")}</SelectItem>
                <SelectItem value="expense">{t("expense")}</SelectItem>
                <SelectItem value="income">{t("income")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <Button
          onClick={handleExport}
          disabled={isPending || !dateFrom || !dateTo}
          variant="outline"
          size="sm"
        >
          {isPending ? (
            <Loader2 className="size-4 animate-spin" data-icon="inline-start" />
          ) : (
            <Download className="size-4" data-icon="inline-start" />
          )}
          {isPending ? t("downloading") : t("download")}
        </Button>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Main Export Section
// ---------------------------------------------------------------------------

export function ExportSection() {
  const t = useTranslations("reports");
  const [isFullExportPending, startFullExport] = useTransition();

  async function handleFlowAccountExport(
    dateFrom: string,
    dateTo: string,
    direction: Direction
  ) {
    const result = await exportFlowAccountAction(dateFrom, dateTo, direction);
    if ("error" in result) {
      alert(result.error);
      return;
    }
    triggerDownload(result.csv, result.filename);
  }

  async function handlePeakExport(
    dateFrom: string,
    dateTo: string,
    direction: Direction
  ) {
    const result = await exportPeakAction(dateFrom, dateTo, direction);
    if ("error" in result) {
      alert(result.error);
      return;
    }
    triggerDownload(result.csv, result.filename);
  }

  function handleFullExport() {
    startFullExport(async () => {
      const result = await exportFullDataAction();
      if ("error" in result) {
        alert(result.error);
        return;
      }
      // Download each file individually
      for (const file of result.files) {
        if (file.format === "csv") {
          triggerDownload(file.content, file.filename);
        } else {
          triggerJsonDownload(file.content, file.filename);
        }
        // Small delay to avoid browser blocking multiple downloads
        await new Promise((r) => setTimeout(r, 100));
      }
    });
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">{t("exports")}</h2>
        <p className="text-sm text-muted-foreground">
          {t("exportsDescription")}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <AccountingExportCard
          title={t("flowaccount")}
          description={t("flowaccountDescription")}
          icon={FileSpreadsheet}
          onExport={handleFlowAccountExport}
        />

        <AccountingExportCard
          title={t("peak")}
          description={t("peakDescription")}
          icon={FileSpreadsheet}
          onExport={handlePeakExport}
        />

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Database className="size-5 text-primary" />
              <CardTitle>{t("fullExport")}</CardTitle>
            </div>
            <CardDescription>{t("fullExportDescription")}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              onClick={handleFullExport}
              disabled={isFullExportPending}
              variant="outline"
              size="sm"
            >
              {isFullExportPending ? (
                <Loader2
                  className="size-4 animate-spin"
                  data-icon="inline-start"
                />
              ) : (
                <Download className="size-4" data-icon="inline-start" />
              )}
              {isFullExportPending ? t("downloading") : t("downloadAll")}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
