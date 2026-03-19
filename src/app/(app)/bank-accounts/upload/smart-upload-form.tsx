"use client";

import { useState, useTransition, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import {
  Upload,
  FileText,
  AlertCircle,
  CheckCircle,
  ArrowLeft,
  Landmark,
  AlertTriangle,
  Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
  parseFileAction,
  confirmImportAction,
  createAccountAndImportAction,
  getAccountsForMatchAction,
  parseWithMappingAction,
  checkOverlapAction,
} from "./actions";
import type { ParseFileResult, OverlapInfo } from "./actions";
import type { ColumnMapping, ParseResult } from "@/lib/parsers/csv-parser";
import type { KBankPdfMeta } from "@/lib/parsers/kbank-pdf-parser";

// ---------------------------------------------------------------------------
// Bank metadata for display
// ---------------------------------------------------------------------------

const BANK_INFO: Record<string, { name: string; color: string }> = {
  KBANK: { name: "KBank (กสิกรไทย)", color: "bg-green-100 text-green-800" },
  SCB: { name: "SCB (ไทยพาณิชย์)", color: "bg-purple-100 text-purple-800" },
  BBL: { name: "BBL (กรุงเทพ)", color: "bg-blue-100 text-blue-800" },
  KTB: { name: "KTB (กรุงไทย)", color: "bg-sky-100 text-sky-800" },
  TMB: { name: "TTB (ทหารไทยธนชาต)", color: "bg-orange-100 text-orange-800" },
  BAY: { name: "BAY (กรุงศรี)", color: "bg-yellow-100 text-yellow-800" },
};

// ---------------------------------------------------------------------------
// State machine
// ---------------------------------------------------------------------------

type UploadStep =
  | { step: "drop" }
  | { step: "parsing" }
  | {
      step: "review";
      format: string;
      result: ParseResult;
      meta?: KBankPdfMeta;
      thaiDescriptions?: Record<string, { type: string; details: string }>;
      matchedAccount?: { id: string; accountNumber: string; accountName: string | null; bankCode: string };
    }
  | {
      step: "mapping";
      csvText: string;
      columns: string[];
      fileName: string;
    }
  | {
      step: "select-account";
      format: string;
      result: ParseResult;
      meta?: KBankPdfMeta;
      thaiDescriptions?: Record<string, { type: string; details: string }>;
      accounts: { id: string; bankCode: string; accountNumber: string; accountName: string | null }[];
    }
  | {
      step: "create-account";
      format: string;
      result: ParseResult;
      meta?: KBankPdfMeta;
    }
  | {
      step: "overlap-review";
      format: string;
      result: ParseResult;
      bankAccountId: string;
      overlap: OverlapInfo;
    }
  | {
      step: "done";
      inserted: number;
      skipped: number;
      balanceWarning: string | null;
    }
  | { step: "error"; message: string };

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SmartUploadForm() {
  const [state, setState] = useState<UploadStep>({ step: "drop" });
  const [isPending, startTransition] = useTransition();
  const [csvText, setCsvText] = useState<string>("");

  // -- Drop handler --
  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      const file = acceptedFiles[0];
      if (!file) return;

      setState({ step: "parsing" });

      // Store CSV text for potential re-parse with mapping
      if (!file.name.toLowerCase().endsWith(".pdf")) {
        const reader = new FileReader();
        reader.onload = (e) => setCsvText(e.target?.result as string ?? "");
        reader.readAsText(file);
      }

      startTransition(async () => {
        const formData = new FormData();
        formData.set("file", file);
        const result = await parseFileAction(formData);
        handleParseResult(result, file.name);
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  function handleParseResult(result: ParseFileResult, fileName?: string) {
    if (!result.success) {
      setState({ step: "error", message: result.error });
      return;
    }

    if ("needsColumnMapping" in result && result.needsColumnMapping) {
      setState({
        step: "mapping",
        csvText,
        columns: result.columns,
        fileName: fileName ?? "file.csv",
      });
      return;
    }

    if (!("result" in result)) return;

    setState({
      step: "review",
      format: result.format,
      result: result.result,
      meta: result.meta,
      thaiDescriptions: result.thaiDescriptions,
      matchedAccount: result.matchedAccount,
    });
  }

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "text/csv": [".csv"],
      "application/pdf": [".pdf"],
    },
    maxFiles: 1,
  });

  // -- Import handler (checks for overlap first) --
  function handleImport(bankAccountId: string) {
    if (state.step !== "review") return;
    startTransition(async () => {
      // Check for overlapping transactions (not statements — transactions are what matter)
      const overlap = await checkOverlapAction(bankAccountId, state.result);

      // Only show overlap review when there are actual duplicate transactions.
      // If all transactions are new, just import directly.
      if (overlap.hasOverlap && overlap.matchedCount > 0) {
        setState({
          step: "overlap-review",
          format: state.format,
          result: state.result,
          bankAccountId,
          overlap,
        });
        return;
      }

      // No meaningful overlap — import directly
      const res = await confirmImportAction({
        bankAccountId,
        format: state.format,
        result: state.result,
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
      }
    });
  }

  // -- Confirm import after overlap review --
  function handleOverlapConfirm() {
    if (state.step !== "overlap-review") return;
    startTransition(async () => {
      const res = await confirmImportAction({
        bankAccountId: state.bankAccountId,
        format: state.format,
        result: state.result,
        transactionsToImport: state.overlap.transactionsToImport,
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
      }
    });
  }

  // -- Proceed to account selection --
  function handleSelectAccount() {
    if (state.step !== "review") return;
    startTransition(async () => {
      const accounts = await getAccountsForMatchAction();
      setState({
        step: "select-account",
        format: state.format,
        result: state.result,
        meta: state.meta,
        thaiDescriptions: state.thaiDescriptions,
        accounts,
      });
    });
  }

  // -- Render --

  if (state.step === "parsing") {
    return (
      <Card>
        <CardContent className="flex items-center gap-3 p-8">
          <div className="size-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <span className="text-sm text-muted-foreground">Parsing file...</span>
        </CardContent>
      </Card>
    );
  }

  if (state.step === "error") {
    return (
      <Card>
        <CardContent className="flex items-start gap-3 p-6">
          <AlertCircle className="mt-0.5 size-5 text-destructive" />
          <div>
            <p className="font-medium text-destructive">{state.message}</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => setState({ step: "drop" })}
            >
              <ArrowLeft className="size-3.5" /> Try again
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (state.step === "done") {
    return (
      <Card>
        <CardContent className="flex items-start gap-3 p-6">
          <CheckCircle className="mt-0.5 size-5 text-green-600" />
          <div>
            <p className="font-medium">Import complete</p>
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
              className="mt-3"
              onClick={() => setState({ step: "drop" })}
            >
              Upload another
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (state.step === "review") {
    return (
      <ReviewStep
        result={state.result}
        meta={state.meta}
        thaiDescriptions={state.thaiDescriptions}
        matchedAccount={state.matchedAccount}
        isPending={isPending}
        onImport={handleImport}
        onSelectAccount={handleSelectAccount}
        onCreateAccount={() =>
          setState({
            step: "create-account",
            format: state.format,
            result: state.result,
            meta: state.meta,
          })
        }
        onBack={() => setState({ step: "drop" })}
      />
    );
  }

  if (state.step === "overlap-review") {
    return (
      <OverlapReviewStep
        overlap={state.overlap}
        totalIncoming={state.result.transactions.length}
        isPending={isPending}
        onConfirm={handleOverlapConfirm}
        onBack={() => setState({ step: "drop" })}
      />
    );
  }

  if (state.step === "mapping") {
    return (
      <MappingStep
        columns={state.columns}
        fileName={state.fileName}
        csvText={csvText}
        isPending={isPending}
        onParsed={(result) =>
          setState({
            step: "review",
            format: "generic_csv",
            result,
          })
        }
        onError={(msg) => setState({ step: "error", message: msg })}
        onBack={() => setState({ step: "drop" })}
        startTransition={startTransition}
      />
    );
  }

  if (state.step === "select-account") {
    return (
      <AccountSelectStep
        accounts={state.accounts}
        meta={state.meta}
        isPending={isPending}
        onSelect={(accountId) => {
          startTransition(async () => {
            // Check for overlapping transactions
            const overlap = await checkOverlapAction(accountId, state.result);
            if (overlap.hasOverlap && overlap.matchedCount > 0) {
              setState({
                step: "overlap-review",
                format: state.format,
                result: state.result,
                bankAccountId: accountId,
                overlap,
              });
              return;
            }
            // No meaningful overlap — import directly
            const res = await confirmImportAction({
              bankAccountId: accountId,
              format: state.format,
              result: state.result,
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
            }
          });
        }}
        onCreateNew={() =>
          setState({
            step: "create-account",
            format: state.format,
            result: state.result,
            meta: state.meta,
          })
        }
        onBack={() => setState({ step: "drop" })}
      />
    );
  }

  if (state.step === "create-account") {
    return (
      <CreateAccountStep
        meta={state.meta}
        isPending={isPending}
        onCreated={(data) => {
          startTransition(async () => {
            const res = await createAccountAndImportAction({
              bankCode: data.bankCode,
              accountNumber: data.accountNumber,
              accountName: data.accountName,
              format: state.format,
              result: state.result,
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
            }
          });
        }}
        onBack={() => setState({ step: "drop" })}
      />
    );
  }

  // -- Drop zone (default) --
  return (
    <div
      {...getRootProps()}
      className={`flex cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-12 text-center transition-colors ${
        isDragActive
          ? "border-primary bg-primary/5"
          : "border-muted-foreground/25 hover:border-primary"
      }`}
    >
      <input {...getInputProps()} />
      <Upload className="size-10 text-muted-foreground" />
      <div>
        <p className="text-sm font-medium">
          {isDragActive ? "Drop file here" : "Upload bank statement"}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          PDF or CSV — KBank auto-detected, other banks via column mapping
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Review Step
// ---------------------------------------------------------------------------

function ReviewStep({
  result,
  meta,
  thaiDescriptions,
  matchedAccount,
  isPending,
  onImport,
  onSelectAccount,
  onCreateAccount,
  onBack,
}: {
  result: ParseResult;
  meta?: KBankPdfMeta;
  thaiDescriptions?: Record<string, { type: string; details: string }>;
  matchedAccount?: { id: string; accountNumber: string; accountName: string | null; bankCode: string };
  isPending: boolean;
  onImport: (accountId: string) => void;
  onSelectAccount: () => void;
  onCreateAccount: () => void;
  onBack: () => void;
}) {
  const credits = result.transactions.filter((t) => t.type === "credit");
  const debits = result.transactions.filter((t) => t.type === "debit");
  const creditTotal = credits.reduce((s, t) => s + parseFloat(t.amount), 0);
  const debitTotal = debits.reduce((s, t) => s + parseFloat(t.amount), 0);

  // Balance check
  let balanceOk: boolean | null = null;
  if (result.openingBalance && result.closingBalance) {
    const opening = parseFloat(result.openingBalance);
    let running = opening;
    for (const txn of result.transactions) {
      const amt = parseFloat(txn.amount);
      running += txn.type === "credit" ? amt : -amt;
    }
    balanceOk = Math.abs(running - parseFloat(result.closingBalance)) < 0.01;
  }

  return (
    <div className="space-y-4">
      {/* Statement Info */}
      {meta && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Landmark className="size-4" />
              Statement Info
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <p className="text-xs text-muted-foreground">Bank</p>
                <Badge className={BANK_INFO[meta.bankCode]?.color ?? "bg-muted"}>
                  {BANK_INFO[meta.bankCode]?.name ?? meta.bankCode}
                </Badge>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Account</p>
                <p className="text-sm font-mono">{meta.accountNumber}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Account Name</p>
                <p className="text-sm">{meta.accountName || "—"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Period</p>
                <p className="text-sm">
                  {result.periodStart} to {result.periodEnd}
                </p>
              </div>
            </div>

            {/* Match status */}
            <div className="mt-3 flex items-center gap-2">
              {matchedAccount ? (
                <>
                  <CheckCircle className="size-4 text-green-600" />
                  <span className="text-sm text-green-700">
                    Matched to existing account: {matchedAccount.accountNumber}
                    {matchedAccount.accountName && ` (${matchedAccount.accountName})`}
                  </span>
                </>
              ) : (
                <>
                  <AlertTriangle className="size-4 text-amber-500" />
                  <span className="text-sm text-amber-700">
                    No matching account found — select or create one below
                  </span>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Summary */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <Stat label="Deposits" value={`${credits.length} txns`} sub={`฿${fmtNum(creditTotal)}`} />
            <Stat label="Withdrawals" value={`${debits.length} txns`} sub={`฿${fmtNum(debitTotal)}`} />
            <Stat label="Opening" value={result.openingBalance ? `฿${fmtNum(parseFloat(result.openingBalance))}` : "—"} />
            <Stat label="Closing" value={result.closingBalance ? `฿${fmtNum(parseFloat(result.closingBalance))}` : "—"} />
            <Stat
              label="Balance Check"
              value={balanceOk === null ? "N/A" : balanceOk ? "PASS" : "FAIL"}
              valueClass={balanceOk === true ? "text-green-600" : balanceOk === false ? "text-red-600" : ""}
            />
          </div>
        </CardContent>
      </Card>

      {/* Parse errors */}
      {result.errors.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base text-amber-600">
              <AlertTriangle className="size-4" />
              Parse Warnings ({result.errors.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1 text-sm text-amber-700">
              {result.errors.map((e, i) => (
                <li key={i}>• {e}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Transaction Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            Transactions ({result.transactions.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="overflow-hidden p-0">
          <div className="max-h-[500px] overflow-y-auto overflow-x-hidden">
            <table className="w-full table-fixed text-sm">
              <thead className="sticky top-0 bg-muted/80 backdrop-blur-sm">
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="px-4 py-2">Date</th>
                  {thaiDescriptions && <th className="px-4 py-2">Type</th>}
                  <th className="px-4 py-2">Description</th>
                  <th className="px-4 py-2">Direction</th>
                  <th className="px-4 py-2 text-right">Amount</th>
                  <th className="px-4 py-2 text-right">Balance</th>
                  <th className="px-4 py-2">Channel</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {result.transactions.map((txn, i) => {
                  const thai = thaiDescriptions?.[txn.externalRef];
                  return (
                    <tr key={i} className="hover:bg-muted/40">
                      <td className="whitespace-nowrap px-4 py-1.5 font-mono text-xs">
                        {txn.date}
                      </td>
                      {thaiDescriptions && (
                        <td className="max-w-[200px] truncate px-4 py-1.5 text-xs text-muted-foreground">
                          {thai?.type ?? "—"}
                        </td>
                      )}
                      <td className="max-w-[280px] truncate px-4 py-1.5">
                        {txn.description}
                      </td>
                      <td className="px-4 py-1.5">
                        <Badge
                          variant={txn.type === "credit" ? "default" : "secondary"}
                          className={
                            txn.type === "credit"
                              ? "bg-green-100 text-green-800"
                              : "bg-red-100 text-red-800"
                          }
                        >
                          {txn.type === "credit" ? "IN" : "OUT"}
                        </Badge>
                      </td>
                      <td className="whitespace-nowrap px-4 py-1.5 text-right font-mono text-xs">
                        {txn.type === "credit" ? "+" : "−"}
                        {fmtNum(parseFloat(txn.amount))}
                      </td>
                      <td className="whitespace-nowrap px-4 py-1.5 text-right font-mono text-xs text-muted-foreground">
                        {txn.runningBalance ? fmtNum(parseFloat(txn.runningBalance)) : "—"}
                      </td>
                      <td className="whitespace-nowrap px-4 py-1.5 text-xs text-muted-foreground">
                        {txn.channel ?? "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex items-center gap-3">
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="size-3.5" /> Back
        </Button>
        <div className="flex-1" />
        {matchedAccount ? (
          <Button
            onClick={() => onImport(matchedAccount.id)}
            disabled={isPending}
          >
            {isPending ? "Importing..." : `Import to ${matchedAccount.accountNumber}`}
          </Button>
        ) : (
          <>
            <Button variant="outline" onClick={onSelectAccount} disabled={isPending}>
              Select Existing Account
            </Button>
            <Button onClick={onCreateAccount} disabled={isPending}>
              <Plus className="size-3.5" /> Create Account & Import
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Account Select Step
// ---------------------------------------------------------------------------

function AccountSelectStep({
  accounts,
  meta,
  isPending,
  onSelect,
  onCreateNew,
  onBack,
}: {
  accounts: { id: string; bankCode: string; accountNumber: string; accountName: string | null }[];
  meta?: KBankPdfMeta;
  isPending: boolean;
  onSelect: (id: string) => void;
  onCreateNew: () => void;
  onBack: () => void;
}) {
  const [mismatchAck, setMismatchAck] = useState(false);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Select Bank Account</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {accounts.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No bank accounts found. Create one to get started.
          </p>
        ) : (
          <div className="space-y-2">
            {accounts.map((account) => {
              const isMismatch =
                meta?.bankCode && account.bankCode !== meta.bankCode;
              const disabled = isMismatch && !mismatchAck;
              return (
                <div
                  key={account.id}
                  className={`flex items-center justify-between rounded-md border p-3 ${
                    isMismatch ? "border-amber-300 bg-amber-50" : ""
                  }`}
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <Badge
                        className={
                          BANK_INFO[account.bankCode]?.color ?? "bg-muted"
                        }
                      >
                        {account.bankCode}
                      </Badge>
                      <span className="font-mono text-sm">
                        {account.accountNumber}
                      </span>
                    </div>
                    {account.accountName && (
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {account.accountName}
                      </p>
                    )}
                    {isMismatch && (
                      <p className="mt-1 flex items-center gap-1 text-xs text-amber-700">
                        <AlertTriangle className="size-3" />
                        Bank mismatch: statement is {meta?.bankCode}, account is{" "}
                        {account.bankCode}
                      </p>
                    )}
                  </div>
                  <Button
                    size="sm"
                    variant={isMismatch ? "outline" : "default"}
                    disabled={disabled || isPending}
                    onClick={() => onSelect(account.id)}
                  >
                    Select
                  </Button>
                </div>
              );
            })}
          </div>
        )}

        {meta?.bankCode &&
          accounts.some((a) => a.bankCode !== meta.bankCode) && (
            <label className="flex items-center gap-2 text-xs text-amber-700">
              <input
                type="checkbox"
                checked={mismatchAck}
                onChange={(e) => setMismatchAck(e.target.checked)}
                className="rounded"
              />
              I understand the bank codes don&apos;t match and want to proceed anyway
            </label>
          )}

        <div className="flex items-center gap-3 pt-2">
          <Button variant="outline" onClick={onBack}>
            <ArrowLeft className="size-3.5" /> Back
          </Button>
          <div className="flex-1" />
          <Button variant="outline" onClick={onCreateNew}>
            <Plus className="size-3.5" /> Create New Account
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Create Account Step
// ---------------------------------------------------------------------------

function CreateAccountStep({
  meta,
  isPending,
  onCreated,
  onBack,
}: {
  meta?: KBankPdfMeta;
  isPending: boolean;
  onCreated: (data: {
    bankCode: string;
    accountNumber: string;
    accountName?: string;
  }) => void;
  onBack: () => void;
}) {
  const [bankCode, setBankCode] = useState(meta?.bankCode ?? "KBANK");
  const [accountNumber, setAccountNumber] = useState(
    meta?.accountNumber ?? ""
  );
  const [accountName, setAccountName] = useState(meta?.accountName ?? "");

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Create Bank Account & Import</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1">
            <Label className="text-xs">Bank Code</Label>
            <Select value={bankCode} onValueChange={(v) => { if (v) setBankCode(v); }}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(BANK_INFO).map(([code, info]) => (
                  <SelectItem key={code} value={code}>
                    {info.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Account Number</Label>
            <Input
              value={accountNumber}
              onChange={(e) => setAccountNumber(e.target.value)}
              placeholder="210-8-48789-8"
              className="font-mono"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Account Name</Label>
            <Input
              value={accountName}
              onChange={(e) => setAccountName(e.target.value)}
              placeholder="Company name"
            />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={onBack}>
            <ArrowLeft className="size-3.5" /> Back
          </Button>
          <div className="flex-1" />
          <Button
            disabled={!accountNumber || isPending}
            onClick={() =>
              onCreated({
                bankCode,
                accountNumber,
                accountName: accountName || undefined,
              })
            }
          >
            {isPending ? "Creating..." : "Create & Import"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Column Mapping Step (for generic CSVs)
// ---------------------------------------------------------------------------

function MappingStep({
  columns,
  fileName,
  csvText,
  isPending,
  onParsed,
  onError,
  onBack,
  startTransition,
}: {
  columns: string[];
  fileName: string;
  csvText: string;
  isPending: boolean;
  onParsed: (result: ParseResult) => void;
  onError: (msg: string) => void;
  onBack: () => void;
  startTransition: React.TransitionStartFunction;
}) {
  const [mapping, setMapping] = useState<Partial<ColumnMapping>>(() => {
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
    return autoMap;
  });

  function handleParse() {
    if (!mapping.date || (!mapping.amount && !mapping.debitAmount)) {
      onError("Date and amount columns are required");
      return;
    }
    startTransition(async () => {
      const result = await parseWithMappingAction(csvText, mapping as ColumnMapping);
      if (!result.success) {
        onError(result.error);
      } else if ("result" in result) {
        onParsed(result.result);
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <FileText className="size-4" />
          Map columns — {fileName}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <MappingSelect label="Date *" value={mapping.date} columns={columns} onChange={(v) => setMapping({ ...mapping, date: v })} />
          <MappingSelect label="Description" value={mapping.description} columns={columns} onChange={(v) => setMapping({ ...mapping, description: v })} />
          <MappingSelect label="Amount" value={mapping.amount} columns={columns} onChange={(v) => setMapping({ ...mapping, amount: v })} />
          <MappingSelect label="Debit" value={mapping.debitAmount} columns={columns} onChange={(v) => setMapping({ ...mapping, debitAmount: v })} />
          <MappingSelect label="Credit" value={mapping.creditAmount} columns={columns} onChange={(v) => setMapping({ ...mapping, creditAmount: v })} />
          <MappingSelect label="Balance" value={mapping.runningBalance} columns={columns} onChange={(v) => setMapping({ ...mapping, runningBalance: v })} />
          <MappingSelect label="Reference" value={mapping.referenceNo} columns={columns} onChange={(v) => setMapping({ ...mapping, referenceNo: v })} />
          <MappingSelect label="Channel" value={mapping.channel} columns={columns} onChange={(v) => setMapping({ ...mapping, channel: v })} />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onBack}>
            Cancel
          </Button>
          <Button onClick={handleParse} disabled={isPending}>
            {isPending ? "Parsing..." : "Parse & Review"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Overlap Review Step
// ---------------------------------------------------------------------------

function OverlapReviewStep({
  overlap,
  totalIncoming,
  isPending,
  onConfirm,
  onBack,
}: {
  overlap: OverlapInfo;
  totalIncoming: number;
  isPending: boolean;
  onConfirm: () => void;
  onBack: () => void;
}) {
  const allAlreadyImported = overlap.newTxnCount === 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <AlertTriangle className="size-4 text-amber-500" />
          Overlapping Statement Detected
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          This date range overlaps with previously imported statements. We
          compared transactions to avoid duplicates.
        </p>

        <div className="grid gap-3 sm:grid-cols-3">
          <Stat
            label="Already imported"
            value={`${overlap.matchedCount}`}
            sub={`of ${totalIncoming} incoming`}
          />
          <Stat
            label="Existing in range"
            value={`${overlap.existingTxnCount}`}
            sub="in database"
          />
          <Stat
            label="New transactions"
            value={`${overlap.newTxnCount}`}
            valueClass={overlap.newTxnCount > 0 ? "text-green-600" : "text-muted-foreground"}
            sub="to import"
          />
        </div>

        {allAlreadyImported && (
          <div className="flex items-center gap-2 rounded-md bg-green-50 p-3">
            <CheckCircle className="size-4 text-green-600" />
            <p className="text-sm text-green-700">
              All transactions in this file are already imported. Nothing new to add.
            </p>
          </div>
        )}

        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={onBack}>
            <ArrowLeft className="size-3.5" /> Cancel
          </Button>
          <div className="flex-1" />
          <Button
            onClick={onConfirm}
            disabled={isPending}
          >
            {isPending
              ? "Importing..."
              : allAlreadyImported
                ? "Confirm (0 new)"
                : `Import ${overlap.newTxnCount} new transaction${overlap.newTxnCount !== 1 ? "s" : ""}`}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

function Stat({
  label,
  value,
  sub,
  valueClass,
}: {
  label: string;
  value: string;
  sub?: string;
  valueClass?: string;
}) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-sm font-semibold ${valueClass ?? ""}`}>{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

function fmtNum(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
