"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

function getMonthOptions(): Array<{ value: string; label: string }> {
  const now = new Date();
  const options: Array<{ value: string; label: string }> = [];

  for (let i = 0; i < 6; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
    options.push({ value, label });
  }

  return options;
}

export function ExportPdfButton() {
  const months = getMonthOptions();
  const [month, setMonth] = useState(months[0].value);
  const [isPending, startTransition] = useTransition();

  function handleExport() {
    startTransition(async () => {
      try {
        const res = await fetch(`/api/reconciliation-summary?month=${month}`);
        if (!res.ok) {
          toast.error("Failed to generate PDF");
          return;
        }
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `reconciliation-summary-${month}.pdf`;
        a.click();
        URL.revokeObjectURL(url);
      } catch {
        toast.error("Network error — could not export PDF");
      }
    });
  }

  return (
    <div className="flex items-center gap-2">
      <Select value={month} onValueChange={(v) => { if (v) setMonth(v); }}>
        <SelectTrigger className="w-[170px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {months.map((m) => (
            <SelectItem key={m.value} value={m.value}>
              {m.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        variant="outline"
        size="sm"
        disabled={isPending}
        onClick={handleExport}
      >
        {isPending ? (
          <Loader2 className="mr-1 size-4 animate-spin" />
        ) : (
          <Download className="mr-1 size-4" />
        )}
        Export PDF
      </Button>
    </div>
  );
}
