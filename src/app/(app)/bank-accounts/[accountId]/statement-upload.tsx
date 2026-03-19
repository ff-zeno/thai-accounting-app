"use client";

import { useState, useTransition, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useDropzone } from "react-dropzone";
import { Upload, AlertCircle, CheckCircle, AlertTriangle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  parseFileAction,
  confirmImportAction,
} from "../upload/actions";
import type { ParseFileResult } from "../upload/actions";

interface StatementUploadProps {
  bankAccountId: string;
}

type UploadState =
  | { step: "idle" }
  | { step: "parsing" }
  | { step: "importing" }
  | {
      step: "done";
      inserted: number;
      skipped: number;
      balanceWarning: string | null;
    }
  | { step: "error"; message: string };

export function StatementUpload({ bankAccountId }: StatementUploadProps) {
  const [state, setState] = useState<UploadState>({ step: "idle" });
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      const file = acceptedFiles[0];
      if (!file) return;

      setState({ step: "parsing" });

      startTransition(async () => {
        const formData = new FormData();
        formData.set("file", file);
        const result: ParseFileResult = await parseFileAction(formData);

        if (!result.success) {
          setState({ step: "error", message: result.error });
          return;
        }

        if ("needsColumnMapping" in result && result.needsColumnMapping) {
          setState({
            step: "error",
            message:
              "This CSV format requires column mapping. Please use the full Upload Statement page instead.",
          });
          return;
        }

        if (!("result" in result)) return;

        // Import directly — findOrCreateStatement handles duplicate statements,
        // txn_dedup partial unique index handles duplicate transactions.
        setState({ step: "importing" });
        const res = await confirmImportAction({
          bankAccountId,
          format: result.format,
          result: result.result,
        });

        if ("error" in res && res.error) {
          setState({ step: "error", message: res.error });
        } else if ("success" in res) {
          setState({
            step: "done",
            inserted: res.inserted!,
            skipped: res.skipped!,
            balanceWarning: res.balanceWarning ?? null,
          });
          router.refresh();
        }
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [bankAccountId]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "text/csv": [".csv"],
      "application/pdf": [".pdf"],
    },
    maxFiles: 1,
  });

  if (state.step === "parsing" || state.step === "importing") {
    return (
      <Card>
        <CardContent className="flex items-center gap-3 p-4">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
          <span className="text-sm text-muted-foreground">
            {state.step === "parsing" ? "Parsing file..." : "Importing..."}
          </span>
        </CardContent>
      </Card>
    );
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
                <AlertTriangle className="size-4" />
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
        {isDragActive ? "Drop file here" : "Upload bank statement"}
      </p>
      <p className="text-xs text-muted-foreground">
        PDF or CSV — KBank auto-detected, other banks via column mapping
      </p>
    </div>
  );
}
