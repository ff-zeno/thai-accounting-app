"use client";

import { useState, useTransition, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { Upload, FileText, AlertCircle, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { uploadStatementAction, detectBankFormatAction } from "../actions";
import { detectColumns } from "@/lib/parsers/csv-parser";
import type { ColumnMapping } from "@/lib/parsers/csv-parser";

interface StatementUploadProps {
  bankAccountId: string;
}

type UploadState =
  | { step: "idle" }
  | { step: "mapping"; csvText: string; columns: string[]; fileName: string }
  | { step: "uploading" }
  | {
      step: "done";
      inserted: number;
      skipped: number;
      parseErrors: string[];
      balanceWarning: string | null;
    }
  | { step: "error"; message: string };

export function StatementUpload({ bankAccountId }: StatementUploadProps) {
  const [state, setState] = useState<UploadState>({ step: "idle" });
  const [isPending, startTransition] = useTransition();
  const [mapping, setMapping] = useState<Partial<ColumnMapping>>({});

  function uploadKBank(csvText: string) {
    setState({ step: "uploading" });
    startTransition(async () => {
      const result = await uploadStatementAction(bankAccountId, csvText, null);
      if (result.error) {
        setState({ step: "error", message: result.error });
      } else {
        setState({
          step: "done",
          inserted: result.inserted!,
          skipped: result.skipped!,
          parseErrors: result.parseErrors ?? [],
          balanceWarning: result.balanceWarning ?? null,
        });
      }
    });
  }

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      const csvText = e.target?.result as string;

      // Auto-detect KBank format — skip column mapping
      const detection = await detectBankFormatAction(csvText);
      if (detection.isKBank) {
        uploadKBank(csvText);
        return;
      }

      const columns = detectColumns(csvText);
      setState({ step: "mapping", csvText, columns, fileName: file.name });
      // Auto-detect common column names
      const autoMap: Partial<ColumnMapping> = {};
      for (const col of columns) {
        const lower = col.toLowerCase();
        if (lower.includes("date")) autoMap.date = col;
        if (lower.includes("description") || lower.includes("detail"))
          autoMap.description = col;
        if (lower.includes("amount") && !lower.includes("debit") && !lower.includes("credit"))
          autoMap.amount = col;
        if (lower.includes("debit")) autoMap.debitAmount = col;
        if (lower.includes("credit")) autoMap.creditAmount = col;
        if (lower.includes("balance")) autoMap.runningBalance = col;
        if (lower.includes("ref")) autoMap.referenceNo = col;
        if (lower.includes("channel")) autoMap.channel = col;
      }
      setMapping(autoMap);
    };
    reader.readAsText(file);
  }, [uploadKBank]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "text/csv": [".csv"] },
    maxFiles: 1,
  });

  function handleUpload() {
    if (state.step !== "mapping") return;
    if (!mapping.date || (!mapping.amount && !mapping.debitAmount)) {
      setState({
        step: "error",
        message: "Date and amount columns are required",
      });
      return;
    }

    const csvText = state.csvText;
    setState({ step: "uploading" });

    startTransition(async () => {
      const result = await uploadStatementAction(
        bankAccountId,
        csvText,
        mapping as ColumnMapping
      );
      if (result.error) {
        setState({ step: "error", message: result.error });
      } else {
        setState({
          step: "done",
          inserted: result.inserted!,
          skipped: result.skipped!,
          parseErrors: result.parseErrors ?? [],
          balanceWarning: result.balanceWarning ?? null,
        });
      }
    });
  }

  if (state.step === "done") {
    return (
      <Card>
        <CardContent className="flex items-start gap-3 p-4">
          <CheckCircle className="mt-0.5 size-5 text-green-600" />
          <div>
            <p className="font-medium">Upload complete</p>
            <p className="text-sm text-muted-foreground">
              {state.inserted} transactions imported, {state.skipped} duplicates
              skipped
            </p>
            {state.balanceWarning && (
              <p className="mt-1 flex items-center gap-1 text-sm text-amber-600">
                <AlertCircle className="size-4" />
                {state.balanceWarning}
              </p>
            )}
            <Button
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={() => setState({ step: "idle" })}
            >
              Upload another
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (state.step === "error") {
    return (
      <Card>
        <CardContent className="flex items-start gap-3 p-4">
          <AlertCircle className="mt-0.5 size-5 text-destructive" />
          <div>
            <p className="font-medium text-destructive">{state.message}</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={() => setState({ step: "idle" })}
            >
              Try again
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (state.step === "mapping") {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FileText className="size-4" />
            Map columns — {state.fileName}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <MappingSelect
              label="Date *"
              value={mapping.date}
              columns={state.columns}
              onChange={(v) => setMapping({ ...mapping, date: v })}
            />
            <MappingSelect
              label="Description"
              value={mapping.description}
              columns={state.columns}
              onChange={(v) => setMapping({ ...mapping, description: v })}
            />
            <MappingSelect
              label="Amount (single column)"
              value={mapping.amount}
              columns={state.columns}
              onChange={(v) => setMapping({ ...mapping, amount: v })}
            />
            <MappingSelect
              label="Debit Amount"
              value={mapping.debitAmount}
              columns={state.columns}
              onChange={(v) => setMapping({ ...mapping, debitAmount: v })}
            />
            <MappingSelect
              label="Credit Amount"
              value={mapping.creditAmount}
              columns={state.columns}
              onChange={(v) => setMapping({ ...mapping, creditAmount: v })}
            />
            <MappingSelect
              label="Running Balance"
              value={mapping.runningBalance}
              columns={state.columns}
              onChange={(v) => setMapping({ ...mapping, runningBalance: v })}
            />
            <MappingSelect
              label="Reference No."
              value={mapping.referenceNo}
              columns={state.columns}
              onChange={(v) => setMapping({ ...mapping, referenceNo: v })}
            />
            <MappingSelect
              label="Channel"
              value={mapping.channel}
              columns={state.columns}
              onChange={(v) => setMapping({ ...mapping, channel: v })}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => setState({ step: "idle" })}
            >
              Cancel
            </Button>
            <Button onClick={handleUpload} disabled={isPending}>
              {isPending ? "Importing..." : "Import Transactions"}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div
      {...getRootProps()}
      className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
        isDragActive
          ? "border-primary bg-primary/5"
          : "border-muted-foreground/25 hover:border-primary"
      }`}
    >
      <input {...getInputProps()} />
      <Upload className="size-8 text-muted-foreground" />
      <p className="text-sm font-medium">
        {isDragActive ? "Drop CSV file here" : "Upload bank statement"}
      </p>
      <p className="text-xs text-muted-foreground">
        Drag & drop a CSV file, or click to select
      </p>
    </div>
  );
}

function MappingSelect({
  label,
  value,
  columns,
  onChange,
}: {
  label: string;
  value?: string;
  columns: string[];
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Select value={value ?? ""} onValueChange={(v) => { if (v) onChange(v); }}>
        <SelectTrigger className="h-8 text-xs">
          <SelectValue placeholder="—" />
        </SelectTrigger>
        <SelectContent>
          {columns.map((col) => (
            <SelectItem key={col} value={col} className="text-xs">
              {col}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
