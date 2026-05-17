"use client";

import { useState, useTransition } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog";
import {
  buildPp30VatLedgerDraftAction,
  buildPp36VatLedgerDraftAction,
  fileVatLedgerDraftAction,
  loadVatDataAction,
  loadVatRegisterAction,
  loadVatForecastAction,
  recordPp36VatLedgerPaymentAction,
} from "./actions";
import {
  RefreshCw,
  Lock,
  AlertTriangle,
  Calendar,
  Globe,
  ClipboardList,
  FileCheck,
  Hammer,
  ReceiptText,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface VatRegisterEntry {
  date: string;
  documentNumber: string;
  vendorName?: string;
  vendorTaxId?: string;
  customerName?: string;
  customerTaxId?: string;
  baseAmount: string;
  vatAmount: string;
  isCreditNote: boolean;
}

interface VatRegisterData {
  inputRegister: VatRegisterEntry[];
  outputRegister: VatRegisterEntry[];
  inputTotal: string;
  outputTotal: string;
}

interface VatLedgerStatusSummary {
  status: string;
  count: number;
  vatAmount: string;
}

interface VatLedgerExceptionSummary {
  severity: string;
  exceptionType: string;
  count: number;
}

interface VatLedgerPeriodDashboard {
  period: {
    year: number;
    month: number;
  };
  pp30: {
    filingId: string | null;
    status: string;
    paymentStatus: string;
    deadline: string;
    outputVatTotal: string;
    inputVatTotal: string;
    pp36ReclaimTotal: string;
    carryforwardIn: string;
    carryforwardOut: string;
    netPayable: string;
    refundable: string;
    signedNetPosition: string;
    nilFilingRequired: boolean;
  };
  pp36: {
    filingId: string | null;
    status: string;
    paymentStatus: string;
    deadline: string;
    pp36VatTotal: string;
    paidAt: Date | string | null;
    rdReceiptNo: string | null;
  };
  inputItems: VatLedgerStatusSummary[];
  outputItems: VatLedgerStatusSummary[];
  pp36Items: VatLedgerStatusSummary[];
  exceptions: VatLedgerExceptionSummary[];
  warnings: {
    expiringInputVat: { count: number; vatAmount: string };
    pp36ReclaimQueue: { count: number; vatAmount: string };
    availableCarryforward: { count: number; amount: string };
  };
}

interface VatForecastRow {
  period: { year: number; month: number };
  pp30: VatLedgerPeriodDashboard["pp30"];
  pp36: VatLedgerPeriodDashboard["pp36"];
  expiringInputVat: { count: number; vatAmount: string };
  pp36Reclaimable: { count: number; vatAmount: string };
  advisoryOnly: boolean;
}

interface VatLedgerDraftResult {
  filing: {
    id: string;
    filingType: string;
    periodYear: number;
    periodMonth: number;
    status: string;
    outputVatTotal?: string | null;
    inputVatTotal?: string | null;
    pp36VatTotal?: string | null;
    pp36ReclaimTotal?: string | null;
    carryforwardIn?: string | null;
  };
  allocatedCounts: {
    output?: number;
    input?: number;
    pp36Reclaim?: number;
    carryforward?: number;
    pp36Obligations?: number;
  };
}

interface VatLedgerFiledResult {
  id: string;
  filingType: string;
  periodYear: number;
  periodMonth: number;
  status: string;
  pp36VatTotal?: string | null;
  netPayable?: string | null;
  paymentStatus?: string | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function formatAmount(value: string | null): string {
  if (!value) return "0.00";
  let normalized: string;
  try {
    normalized = centsToMoney(moneyToCents(value));
  } catch {
    normalized = "0.00";
  }
  return Number(normalized).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatPeriod(year: number, month: number): string {
  return `${String(month).padStart(2, "0")}/${year}`;
}

function moneyToCents(value: string): bigint {
  const trimmed = value.trim();
  const sign = trimmed.startsWith("-") ? BigInt(-1) : BigInt(1);
  const unsigned = trimmed.replace(/^[+-]/, "");
  const [whole = "0", fractional = ""] = unsigned.split(".");
  const cents = `${fractional}00`.slice(0, 2);
  return sign * (BigInt(whole || "0") * BigInt(100) + BigInt(cents || "0"));
}

function centsToMoney(cents: bigint): string {
  const zero = BigInt(0);
  const hundred = BigInt(100);
  const sign = cents < zero ? "-" : "";
  const absolute = cents < zero ? -cents : cents;
  const whole = absolute / hundred;
  const fractional = String(absolute % hundred).padStart(2, "0");
  return `${sign}${whole}.${fractional}`;
}

function getStatusVariant(status: string | null) {
  switch (status) {
    case "filed":
    case "paid":
      return "default" as const;
    default:
      return "secondary" as const;
  }
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function VatView() {
  const currentDate = new Date();
  const [year, setYear] = useState(currentDate.getFullYear());
  const [month, setMonth] = useState(currentDate.getMonth() + 1);
  const [isPending, startTransition] = useTransition();
  const [dashboard, setDashboard] = useState<VatLedgerPeriodDashboard | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [registerData, setRegisterData] = useState<VatRegisterData | null>(null);
  const [showRegister, setShowRegister] = useState(false);
  const [ledgerDraft, setLedgerDraft] = useState<VatLedgerDraftResult | null>(null);
  const [ledgerActionError, setLedgerActionError] = useState<string | null>(null);
  const [ledgerFiled, setLedgerFiled] = useState<VatLedgerFiledResult | null>(null);
  const [pp36PaymentAmount, setPp36PaymentAmount] = useState("");
  const [pp36PaymentDate, setPp36PaymentDate] = useState("");
  const [pp36PaymentReceipt, setPp36PaymentReceipt] = useState("");
  const [forecast, setForecast] = useState<VatForecastRow[] | null>(null);

  function handleLoadData() {
    startTransition(async () => {
      const result = await loadVatDataAction(year, month);
      if (!("success" in result)) {
        setLedgerActionError(result.error ?? "VAT ledger period could not be loaded.");
        return;
      }
      const nextDashboard = result.dashboard as VatLedgerPeriodDashboard;
      setDashboard(nextDashboard);
      if (
        nextDashboard.pp36.filingId &&
        nextDashboard.pp36.status === "filed" &&
        nextDashboard.pp36.paymentStatus === "waiting_to_pay_tax"
      ) {
        setPp36PaymentAmount(nextDashboard.pp36.pp36VatTotal);
        setPp36PaymentDate(new Date().toISOString().slice(0, 10));
        setPp36PaymentReceipt(nextDashboard.pp36.rdReceiptNo ?? "");
      }
      setLoaded(true);
      setShowRegister(false);
      setRegisterData(null);
      setLedgerDraft(null);
      setLedgerFiled(null);
      setLedgerActionError(null);
      setForecast(null);
    });
  }

  function handleLoadRegister() {
    startTransition(async () => {
      const result = await loadVatRegisterAction(year, month);
      if (!("success" in result)) return;
      setRegisterData(result.register as VatRegisterData);
      setShowRegister(true);
    });
  }

  function handleBuildLedgerDraft() {
    startTransition(async () => {
      const result = await buildPp30VatLedgerDraftAction(year, month);
      if ("error" in result) {
        setLedgerActionError(result.error ?? "VAT ledger draft could not be built.");
        return;
      }
      setLedgerDraft(result as VatLedgerDraftResult);
      setLedgerActionError(null);
      const dashboardResult = await loadVatDataAction(year, month);
      if ("dashboard" in dashboardResult) setDashboard(dashboardResult.dashboard as VatLedgerPeriodDashboard);
    });
  }

  function handleBuildPp36LedgerDraft() {
    startTransition(async () => {
      const result = await buildPp36VatLedgerDraftAction(year, month);
      if ("error" in result) {
        setLedgerActionError(result.error ?? "PP 36 ledger draft could not be built.");
        return;
      }
      setLedgerDraft(result as VatLedgerDraftResult);
      setLedgerActionError(null);
      const dashboardResult = await loadVatDataAction(year, month);
      if ("dashboard" in dashboardResult) setDashboard(dashboardResult.dashboard as VatLedgerPeriodDashboard);
    });
  }

  function handleFileLedgerDraft() {
    if (!ledgerDraft) return;
    startTransition(async () => {
      const result = await fileVatLedgerDraftAction(ledgerDraft.filing.id);
      if ("error" in result) {
        setLedgerActionError(result.error ?? "VAT ledger draft could not be filed.");
        return;
      }
      if (result.filing.filingType === "pp36") {
        setLedgerFiled(result.filing as VatLedgerFiledResult);
        setPp36PaymentAmount(result.filing.pp36VatTotal ?? "");
        setPp36PaymentDate(new Date().toISOString().slice(0, 10));
        setPp36PaymentReceipt("");
        const dashboardResult = await loadVatDataAction(year, month);
        if ("dashboard" in dashboardResult) {
          setDashboard(dashboardResult.dashboard as VatLedgerPeriodDashboard);
        }
      } else {
        handleLoadData();
      }
      setLedgerDraft(null);
      setLedgerActionError(null);
    });
  }

  function handleRecordPp36Payment() {
    const filingId =
      ledgerFiled?.filingType === "pp36" ? ledgerFiled.id : dashboard?.pp36.filingId;
    if (!filingId) return;
    startTransition(async () => {
      const result = await recordPp36VatLedgerPaymentAction(
        filingId,
        pp36PaymentAmount,
        pp36PaymentDate,
        pp36PaymentReceipt || undefined
      );
      if ("error" in result) {
        setLedgerActionError(result.error ?? "PP 36 payment could not be recorded.");
        return;
      }
      setLedgerFiled(null);
      setLedgerActionError(null);
      handleLoadData();
    });
  }

  function handleLoadForecast() {
    startTransition(async () => {
      const result = await loadVatForecastAction(year, month);
      if (!("success" in result)) {
        setLedgerActionError(result.error ?? "VAT forecast could not be loaded.");
        return;
      }
      setForecast(result.forecast as VatForecastRow[]);
      setLedgerActionError(null);
    });
  }

  const years = Array.from(
    { length: 5 },
    (_, i) => currentDate.getFullYear() - 2 + i
  );

  const isNilFiling = dashboard?.pp30.nilFilingRequired ?? false;
  const pp30Status = dashboard?.pp30.status ?? "not_built";
  const pp36Status = dashboard?.pp36.status ?? "not_built";

  return (
    <div className="space-y-6">
      {/* Period Selector */}
      <Card>
        <CardContent className="pt-0">
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-muted-foreground">
                Year
              </label>
              <select
                value={year}
                onChange={(e) => {
                  setYear(Number(e.target.value));
                  setLoaded(false);
                  setDashboard(null);
                }}
                className="flex h-8 w-24 items-center rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                {years.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-muted-foreground">
                Month
              </label>
              <select
                value={month}
                onChange={(e) => {
                  setMonth(Number(e.target.value));
                  setLoaded(false);
                  setDashboard(null);
                }}
                className="flex h-8 w-36 items-center rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                {MONTHS.map((name, i) => (
                  <option key={i + 1} value={i + 1}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
            <Button
              onClick={handleLoadData}
              disabled={isPending}
              variant="outline"
            >
              <RefreshCw
                className={`mr-2 size-4 ${isPending ? "animate-spin" : ""}`}
              />
              {loaded ? "Refresh" : "Load Period"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {!loaded && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Calendar className="mx-auto mb-3 size-8 opacity-50" />
            <p>Select a period and click Load Period to view VAT data.</p>
          </CardContent>
        </Card>
      )}

      {loaded && dashboard && (
        <>
          {/* Nil Filing Indicator */}
          {isNilFiling && (
            <Card className="border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950">
              <CardContent className="py-4">
                <div className="flex items-center gap-3">
                  <AlertTriangle className="size-5 text-amber-600" />
                  <div>
                    <p className="font-medium text-amber-800 dark:text-amber-200">
                      Nil Filing Required
                    </p>
                    <p className="text-sm text-amber-700 dark:text-amber-300">
                      No VAT activity in {MONTHS[month - 1]} {year}. PP 30 must
                      still be filed every month even with zero activity.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          <VatOperationsLedgerPanel
            dashboard={dashboard}
            draft={ledgerDraft}
            filed={ledgerFiled}
            actionError={ledgerActionError}
            isPending={isPending}
            onBuildDraft={handleBuildLedgerDraft}
              onBuildPp36Draft={handleBuildPp36LedgerDraft}
              onFileDraft={handleFileLedgerDraft}
              pp36PaymentFilingId={
                ledgerFiled?.filingType === "pp36"
                  ? ledgerFiled.id
                  : dashboard.pp36.filingId
              }
              pp36PaymentAmount={pp36PaymentAmount}
              pp36PaymentDate={pp36PaymentDate}
              pp36PaymentReceipt={pp36PaymentReceipt}
            onPp36PaymentAmountChange={setPp36PaymentAmount}
            onPp36PaymentDateChange={setPp36PaymentDate}
            onPp36PaymentReceiptChange={setPp36PaymentReceipt}
            onRecordPp36Payment={handleRecordPp36Payment}
          />

          {/* PP 30 Section */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>PP 30 - VAT Return</CardTitle>
                  <div className="mt-1 flex items-center gap-3 text-sm text-muted-foreground">
                    <span>
                      Period: {MONTHS[month - 1]} {year}
                    </span>
                    <span>Deadline: {dashboard.pp30.deadline} (e-filing)</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={getStatusVariant(pp30Status)}>
                    {formatStatusLabel(pp30Status)}
                  </Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="grid gap-4 sm:grid-cols-3">
                  <SummaryCard
                    label="Output VAT"
                    sublabel="Ledger output items"
                    value={dashboard.pp30.outputVatTotal}
                  />
                  <SummaryCard
                    label="Input VAT (PP 30)"
                    sublabel="Ledger input claims"
                    value={dashboard.pp30.inputVatTotal}
                  />
                  <SummaryCard
                    label="Net VAT Payable"
                    sublabel="After reclaims and carryforward"
                    value={dashboard.pp30.netPayable}
                    highlight
                  />
                </div>

                {parseFloat(dashboard.pp30.refundable) > 0 && (
                  <div className="rounded-lg border border-dashed border-muted-foreground/30 bg-muted/30 px-4 py-3">
                    <div className="flex items-center gap-2 text-sm">
                      <Lock className="size-4 text-muted-foreground" />
                      <span className="font-medium">
                        Refundable / carryforward credit: {formatAmount(dashboard.pp30.refundable)}
                      </span>
                      <span className="text-muted-foreground">
                        Credit is frozen only when the PP 30 ledger draft is filed.
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* PP 36 Section (separate from PP 30) */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Globe className="size-5" />
                    PP 36 - Reverse Charge VAT
                  </CardTitle>
                  <div className="mt-1 flex flex-col gap-1 text-sm text-muted-foreground">
                    <span>
                      Self-assessed VAT on foreign service purchases. This is a
                      separate obligation from PP 30.
                    </span>
                    <span>Deadline: {dashboard.pp36.deadline}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={getStatusVariant(pp36Status)}>
                    {formatStatusLabel(pp36Status)}
                  </Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-3">
                <SummaryCard
                  label="PP 36 VAT"
                  sublabel="Exact-period obligations"
                  value={dashboard.pp36.pp36VatTotal}
                />
                <SummaryCard
                  label="Reclaim Queue"
                  sublabel={`${dashboard.warnings.pp36ReclaimQueue.count} paid items`}
                  value={dashboard.warnings.pp36ReclaimQueue.vatAmount}
                />
                <SummaryCard
                  label="Payment State"
                  sublabel={formatStatusLabel(dashboard.pp36.paymentStatus)}
                  value={dashboard.pp36.pp36VatTotal}
                />
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                PP 36 obligations are filed and paid separately. Paid obligations
                enter the PP 30 reclaim queue with explicit eligibility and expiry periods.
              </p>
            </CardContent>
          </Card>

          {/* VAT Register Link */}
          <Card>
            <CardContent className="py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <ClipboardList className="size-5 text-muted-foreground" />
                  <div>
                    <p className="font-medium">VAT Register</p>
                    <p className="text-sm text-muted-foreground">
                      Document-level detail for Revenue Department audit
                    </p>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleLoadRegister}
                  disabled={isPending}
                >
                  {showRegister ? "Refresh Register" : "View Register"}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleLoadForecast}
                  disabled={isPending}
                >
                  Forecast
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* VAT Register Display */}
          {showRegister && registerData && (
            <VatRegisterDisplay
              data={registerData}
              year={year}
              month={month}
            />
          )}

          {forecast && <VatForecastDisplay forecast={forecast} />}
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// VAT operations ledger overview
// ---------------------------------------------------------------------------

function VatOperationsLedgerPanel({
  dashboard,
  draft,
  filed,
  actionError,
  isPending,
  onBuildDraft,
  onBuildPp36Draft,
  onFileDraft,
  pp36PaymentFilingId,
  pp36PaymentAmount,
  pp36PaymentDate,
  pp36PaymentReceipt,
  onPp36PaymentAmountChange,
  onPp36PaymentDateChange,
  onPp36PaymentReceiptChange,
  onRecordPp36Payment,
}: {
  dashboard: VatLedgerPeriodDashboard;
  draft: VatLedgerDraftResult | null;
  filed: VatLedgerFiledResult | null;
  actionError: string | null;
  isPending: boolean;
  onBuildDraft: () => void;
  onBuildPp36Draft: () => void;
  onFileDraft: () => void;
  pp36PaymentFilingId: string | null;
  pp36PaymentAmount: string;
  pp36PaymentDate: string;
  pp36PaymentReceipt: string;
  onPp36PaymentAmountChange: (value: string) => void;
  onPp36PaymentDateChange: (value: string) => void;
  onPp36PaymentReceiptChange: (value: string) => void;
  onRecordPp36Payment: () => void;
}) {
  const hasExceptions = dashboard.exceptions.length > 0;

  return (
    <Card>
      <CardHeader>
        <div>
          <div>
            <CardTitle>VAT Operations Ledger</CardTitle>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <Badge variant="outline">Ledger source of truth</Badge>
              <Badge variant="outline">
                PP 30 {formatStatusLabel(dashboard.pp30.status)}
              </Badge>
              <Badge variant="outline">
                PP 36 {formatStatusLabel(dashboard.pp36.status)}
              </Badge>
              {hasExceptions && (
                <Badge variant="destructive">
                  {dashboard.exceptions.reduce((sum, item) => sum + item.count, 0)} exceptions
                </Badge>
              )}
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col gap-3 rounded-lg border bg-muted/20 p-3 md:flex-row md:items-center md:justify-between">
          <div className="min-w-0">
            <div className="text-sm font-medium">VAT ledger draft</div>
            {draft ? (
              <div className="mt-1 flex flex-wrap gap-2 text-xs text-muted-foreground">
                <span>{draft.filing.filingType.toUpperCase()}</span>
                {draft.filing.filingType === "pp36" ? (
                  <span>Obligations {draft.allocatedCounts.pp36Obligations ?? 0}</span>
                ) : (
                  <>
                    <span>Output {draft.allocatedCounts.output ?? 0}</span>
                    <span>Input {draft.allocatedCounts.input ?? 0}</span>
                    <span>PP 36 reclaim {draft.allocatedCounts.pp36Reclaim ?? 0}</span>
                    <span>Carryforward {draft.allocatedCounts.carryforward ?? 0}</span>
                  </>
                )}
              </div>
            ) : (
              <div className="mt-1 text-xs text-muted-foreground">
                No ledger draft built for this view.
              </div>
            )}
            {actionError && (
              <div className="mt-2 text-xs font-medium text-destructive">{actionError}</div>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onBuildDraft}
              disabled={isPending || !!draft || dashboard.pp30.status === "filed"}
            >
              <Hammer className="mr-2 size-4" />
              Build PP 30
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onBuildPp36Draft}
              disabled={isPending || !!draft || dashboard.pp36.status === "filed"}
            >
              <Hammer className="mr-2 size-4" />
              Build PP 36
            </Button>
            <Dialog>
              <DialogTrigger
                render={
                  <Button
                    type="button"
                    size="sm"
                    disabled={isPending || !draft}
                  />
                }
              >
                <FileCheck className="mr-2 size-4" />
                File Draft
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>File VAT ledger draft</DialogTitle>
                  <DialogDescription>
                    Filing freezes VAT ledger line snapshots and creates the VAT
                    period lock. Later changes must use an amendment or reversal
                    path.
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <DialogClose render={<Button variant="outline" />}>
                    Cancel
                  </DialogClose>
                  <DialogClose render={<Button onClick={onFileDraft} />}>
                    <FileCheck className="mr-2 size-4" />
                    File Draft
                  </DialogClose>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {((filed?.filingType === "pp36" && filed.status === "filed") ||
          (pp36PaymentFilingId &&
            dashboard.pp36.status === "filed" &&
            dashboard.pp36.paymentStatus === "waiting_to_pay_tax")) && (
          <div className="rounded-lg border bg-muted/20 p-3">
            <div className="flex flex-col gap-3 md:flex-row md:items-end">
              <div className="grid flex-1 gap-1.5">
                <Label htmlFor="pp36-payment-amount">Amount</Label>
                <Input
                  id="pp36-payment-amount"
                  inputMode="decimal"
                  value={pp36PaymentAmount}
                  onChange={(event) => onPp36PaymentAmountChange(event.target.value)}
                />
              </div>
              <div className="grid flex-1 gap-1.5">
                <Label htmlFor="pp36-payment-date">Paid date</Label>
                <Input
                  id="pp36-payment-date"
                  type="date"
                  value={pp36PaymentDate}
                  onChange={(event) => onPp36PaymentDateChange(event.target.value)}
                />
              </div>
              <div className="grid flex-1 gap-1.5">
                <Label htmlFor="pp36-payment-receipt">Receipt</Label>
                <Input
                  id="pp36-payment-receipt"
                  value={pp36PaymentReceipt}
                  onChange={(event) => onPp36PaymentReceiptChange(event.target.value)}
                />
              </div>
              <Button
                type="button"
                onClick={onRecordPp36Payment}
                disabled={isPending || !pp36PaymentAmount || !pp36PaymentDate}
              >
                <ReceiptText className="mr-2 size-4" />
                Record Payment
              </Button>
            </div>
          </div>
        )}

        <div className="grid gap-3 md:grid-cols-3">
          <LedgerStatusGroup title="Input VAT Items" items={dashboard.inputItems} />
          <LedgerStatusGroup title="Output VAT Items" items={dashboard.outputItems} />
          <LedgerStatusGroup title="PP 36 Obligations" items={dashboard.pp36Items} />
        </div>

        {hasExceptions && (
          <div className="overflow-hidden rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Severity</TableHead>
                  <TableHead>Exception</TableHead>
                  <TableHead className="text-right">Count</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dashboard.exceptions.map((item) => (
                  <TableRow key={`${item.severity}-${item.exceptionType}`}>
                    <TableCell>
                      <Badge variant={getExceptionSeverityVariant(item.severity)}>
                        {item.severity.toUpperCase()}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {item.exceptionType}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {item.count}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function LedgerStatusGroup({
  title,
  items,
}: {
  title: string;
  items: VatLedgerStatusSummary[];
}) {
  const totalCount = items.reduce((sum, item) => sum + item.count, 0);
  const totalVat = items.reduce(
    (sum, item) => sum + moneyToCents(item.vatAmount),
    BigInt(0)
  );

  return (
    <div className="rounded-lg border p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-medium">{title}</div>
        <div className="text-sm tabular-nums text-muted-foreground">
          {totalCount}
        </div>
      </div>
      <div className="mt-1 text-lg font-semibold tabular-nums">
        {formatAmount(centsToMoney(totalVat))}
      </div>
      <div className="mt-3 space-y-2">
        {items.length === 0 ? (
          <div className="text-sm text-muted-foreground">No rows</div>
        ) : (
          items.map((item) => (
            <div
              key={item.status}
              className="flex items-center justify-between gap-2 text-sm"
            >
              <span className="truncate text-muted-foreground">
                {formatStatusLabel(item.status)}
              </span>
              <span className="font-mono tabular-nums">
                {item.count} / {formatAmount(item.vatAmount)}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function getExceptionSeverityVariant(severity: string) {
  switch (severity) {
    case "p0":
      return "destructive" as const;
    case "p1":
      return "outline" as const;
    default:
      return "secondary" as const;
  }
}

function VatForecastDisplay({ forecast }: { forecast: VatForecastRow[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>VAT Forecast</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Period</TableHead>
              <TableHead>PP 30</TableHead>
              <TableHead>PP 36</TableHead>
              <TableHead className="text-right">Expiring Input</TableHead>
              <TableHead className="text-right">PP 36 Reclaimable</TableHead>
              <TableHead className="text-right">Projected Payable</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {forecast.map((row) => (
              <TableRow key={`${row.period.year}-${row.period.month}`}>
                <TableCell>{formatPeriod(row.period.year, row.period.month)}</TableCell>
                <TableCell>
                  <Badge variant="outline">{formatStatusLabel(row.pp30.status)}</Badge>
                </TableCell>
                <TableCell>
                  <Badge variant="outline">{formatStatusLabel(row.pp36.status)}</Badge>
                </TableCell>
                <TableCell className="text-right font-mono">
                  {row.expiringInputVat.count} / {formatAmount(row.expiringInputVat.vatAmount)}
                </TableCell>
                <TableCell className="text-right font-mono">
                  {row.pp36Reclaimable.count} / {formatAmount(row.pp36Reclaimable.vatAmount)}
                </TableCell>
                <TableCell className="text-right font-mono">
                  {formatAmount(row.pp30.netPayable)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <p className="mt-3 text-xs text-muted-foreground">
          Forecast is advisory only and does not create or mutate filing state.
        </p>
      </CardContent>
    </Card>
  );
}

function formatStatusLabel(value: string): string {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

// ---------------------------------------------------------------------------
// Summary card
// ---------------------------------------------------------------------------

function SummaryCard({
  label,
  sublabel,
  value,
  highlight,
}: {
  label: string;
  sublabel: string;
  value: string | null;
  highlight?: boolean;
}) {
  const numValue = parseFloat(value ?? "0");
  return (
    <div
      className={`rounded-lg border p-4 ${
        highlight ? "border-primary/30 bg-primary/5" : ""
      }`}
    >
      <p className="text-sm font-medium text-muted-foreground">{label}</p>
      <p className="text-xs text-muted-foreground">{sublabel}</p>
      <p
        className={`mt-1 text-2xl font-semibold tabular-nums ${
          highlight && numValue < 0 ? "text-green-600" : ""
        }`}
      >
        {formatAmount(value)}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// VAT Register
// ---------------------------------------------------------------------------

function VatRegisterDisplay({
  data,
  year,
  month,
}: {
  data: VatRegisterData;
  year: number;
  month: number;
}) {
  return (
    <div className="space-y-6">
      {/* Output VAT Register */}
      <Card>
        <CardHeader>
          <CardTitle>
            Output VAT Register - {MONTHS[month - 1]} {year}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {data.outputRegister.length === 0 ? (
            <p className="py-4 text-center text-muted-foreground">
              No output VAT entries.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Document No.</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Tax ID</TableHead>
                  <TableHead className="text-right">Base Amount</TableHead>
                  <TableHead className="text-right">VAT Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.outputRegister.map((entry, i) => (
                  <TableRow
                    key={i}
                    className={entry.isCreditNote ? "text-red-600" : ""}
                  >
                    <TableCell>{entry.date || "-"}</TableCell>
                    <TableCell className="font-mono text-xs">
                      {entry.documentNumber || "-"}
                      {entry.isCreditNote && (
                        <Badge
                          variant="secondary"
                          className="ml-2 text-[10px]"
                        >
                          CN
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>{entry.customerName || "-"}</TableCell>
                    <TableCell className="font-mono text-xs">
                      {entry.customerTaxId || "-"}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {formatAmount(entry.baseAmount)}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {formatAmount(entry.vatAmount)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={5} className="font-medium">
                    Total Output VAT
                  </TableCell>
                  <TableCell className="text-right font-mono font-medium">
                    {formatAmount(data.outputTotal)}
                  </TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Input VAT Register */}
      <Card>
        <CardHeader>
          <CardTitle>
            Input VAT Register - {MONTHS[month - 1]} {year}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {data.inputRegister.length === 0 ? (
            <p className="py-4 text-center text-muted-foreground">
              No input VAT entries.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Document No.</TableHead>
                  <TableHead>Vendor</TableHead>
                  <TableHead>Tax ID</TableHead>
                  <TableHead className="text-right">Base Amount</TableHead>
                  <TableHead className="text-right">VAT Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.inputRegister.map((entry, i) => (
                  <TableRow
                    key={i}
                    className={entry.isCreditNote ? "text-red-600" : ""}
                  >
                    <TableCell>{entry.date || "-"}</TableCell>
                    <TableCell className="font-mono text-xs">
                      {entry.documentNumber || "-"}
                      {entry.isCreditNote && (
                        <Badge
                          variant="secondary"
                          className="ml-2 text-[10px]"
                        >
                          CN
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>{entry.vendorName || "-"}</TableCell>
                    <TableCell className="font-mono text-xs">
                      {entry.vendorTaxId || "-"}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {formatAmount(entry.baseAmount)}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {formatAmount(entry.vatAmount)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={5} className="font-medium">
                    Total Input VAT
                  </TableCell>
                  <TableCell className="text-right font-mono font-medium">
                    {formatAmount(data.inputTotal)}
                  </TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
