"use client";

import { useState, useTransition } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  loadVatDataAction,
  markPp30FiledAction,
  markPp36FiledAction,
  loadVatRegisterAction,
} from "./actions";
import {
  RefreshCw,
  Lock,
  AlertTriangle,
  Calendar,
  FileText,
  Globe,
  ClipboardList,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface VatRecord {
  id: string;
  outputVat: string | null;
  inputVatPp30: string | null;
  pp36ReverseCharge: string | null;
  netVatPayable: string | null;
  pp30Status: "draft" | "filed" | "paid" | null;
  pp30Deadline: string | null;
  pp36Status: "draft" | "filed" | "paid" | null;
  pp36Deadline: string | null;
  nilFilingRequired: boolean | null;
  periodLocked: boolean | null;
}

interface Pp36Document {
  id: string;
  documentNumber: string | null;
  issueDate: string | null;
  subtotal: string | null;
  vatAmount: string | null;
  totalAmount: string | null;
  vendorName: string;
  vendorNameTh: string | null;
  vendorTaxId: string | null;
  vendorCountry: string | null;
  vendorEntityType: string;
}

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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function formatAmount(value: string | null): string {
  if (!value) return "0.00";
  return parseFloat(value).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
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
  const [record, setRecord] = useState<VatRecord | null>(null);
  const [pp36Documents, setPp36Documents] = useState<Pp36Document[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [registerData, setRegisterData] = useState<VatRegisterData | null>(null);
  const [showRegister, setShowRegister] = useState(false);

  function handleLoadData() {
    startTransition(async () => {
      const result = await loadVatDataAction(year, month);
      if ("error" in result) return;
      setRecord(result.record as VatRecord);
      setPp36Documents(result.pp36Documents as Pp36Document[]);
      setLoaded(true);
      setShowRegister(false);
      setRegisterData(null);
    });
  }

  function handleMarkPp30Filed() {
    if (!record) return;
    startTransition(async () => {
      await markPp30FiledAction(record.id);
      handleLoadData();
    });
  }

  function handleMarkPp36Filed() {
    if (!record) return;
    startTransition(async () => {
      await markPp36FiledAction(record.id);
      handleLoadData();
    });
  }

  function handleLoadRegister() {
    startTransition(async () => {
      const result = await loadVatRegisterAction(year, month);
      if ("error" in result) return;
      setRegisterData(result.register as VatRegisterData);
      setShowRegister(true);
    });
  }

  const years = Array.from(
    { length: 5 },
    (_, i) => currentDate.getFullYear() - 2 + i
  );

  const isNilFiling = record?.nilFilingRequired ?? false;
  const pp30Status = record?.pp30Status ?? "draft";
  const pp36Status = record?.pp36Status ?? "draft";

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

      {loaded && record && (
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
                    {record.pp30Deadline && (
                      <span className="flex items-center gap-1">
                        <FileText className="size-3" />
                        Deadline: {record.pp30Deadline} (e-filing, 23rd)
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={getStatusVariant(pp30Status)}>
                    {record.periodLocked && <Lock className="mr-1 size-3" />}
                    {pp30Status.charAt(0).toUpperCase() + pp30Status.slice(1)}
                  </Badge>
                  {pp30Status === "draft" && (
                    <MarkAsFiledDialog
                      label="PP 30"
                      year={year}
                      month={month}
                      isPending={isPending}
                      onConfirm={handleMarkPp30Filed}
                    />
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="grid gap-4 sm:grid-cols-3">
                  <SummaryCard
                    label="Output VAT"
                    sublabel="From income documents"
                    value={record.outputVat}
                  />
                  <SummaryCard
                    label="Input VAT (PP 30)"
                    sublabel="From domestic VAT-registered vendors"
                    value={record.inputVatPp30}
                  />
                  <SummaryCard
                    label="Net VAT Payable"
                    sublabel="Output VAT - Input VAT"
                    value={record.netVatPayable}
                    highlight
                  />
                </div>

                {/* PP 36 shown for reference but explicitly excluded */}
                {parseFloat(record.pp36ReverseCharge ?? "0") > 0 && (
                  <div className="rounded-lg border border-dashed border-muted-foreground/30 bg-muted/30 px-4 py-3">
                    <div className="flex items-center gap-2 text-sm">
                      <Globe className="size-4 text-muted-foreground" />
                      <span className="font-medium">
                        PP 36 Reverse Charge: {formatAmount(record.pp36ReverseCharge)}
                      </span>
                      <span className="text-muted-foreground">
                        -- PP 36 is a separate obligation. NOT included in PP 30 net calculation.
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
                    {record.pp36Deadline && (
                      <span className="flex items-center gap-1">
                        <FileText className="size-3" />
                        Deadline: {record.pp36Deadline} (15th of following month)
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={getStatusVariant(pp36Status)}>
                    {pp36Status.charAt(0).toUpperCase() + pp36Status.slice(1)}
                  </Badge>
                  {pp36Status === "draft" &&
                    parseFloat(record.pp36ReverseCharge ?? "0") > 0 && (
                      <MarkAsFiledDialog
                        label="PP 36"
                        year={year}
                        month={month}
                        isPending={isPending}
                        onConfirm={handleMarkPp36Filed}
                      />
                    )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {pp36Documents.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground">
                  No foreign vendor service purchases in this period.
                </div>
              ) : (
                <>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Document</TableHead>
                        <TableHead>Foreign Vendor</TableHead>
                        <TableHead>Country</TableHead>
                        <TableHead className="text-right">
                          Invoice Amount
                        </TableHead>
                        <TableHead className="text-right">
                          Reverse Charge VAT
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pp36Documents.map((doc) => (
                        <TableRow key={doc.id}>
                          <TableCell>{doc.issueDate ?? "-"}</TableCell>
                          <TableCell className="font-mono text-xs">
                            {doc.documentNumber ?? "-"}
                          </TableCell>
                          <TableCell>
                            <div>
                              <div className="font-medium">
                                {doc.vendorName}
                              </div>
                              {doc.vendorNameTh && (
                                <div className="text-xs text-muted-foreground">
                                  {doc.vendorNameTh}
                                </div>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            {doc.vendorCountry ?? "Foreign"}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {formatAmount(doc.subtotal)}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {formatAmount(doc.vatAmount)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                    <TableFooter>
                      <TableRow>
                        <TableCell colSpan={5} className="font-medium">
                          Total PP 36 Reverse Charge
                        </TableCell>
                        <TableCell className="text-right font-mono font-medium">
                          {formatAmount(record.pp36ReverseCharge)}
                        </TableCell>
                      </TableRow>
                    </TableFooter>
                  </Table>
                  <p className="mt-2 text-xs text-muted-foreground">
                    PP 36 is NOT reclaimable. This is a pure cost and never
                    offsets input VAT on PP 30.
                  </p>
                </>
              )}
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
        </>
      )}
    </div>
  );
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

// ---------------------------------------------------------------------------
// Mark as Filed Dialog
// ---------------------------------------------------------------------------

function MarkAsFiledDialog({
  label,
  year,
  month,
  isPending,
  onConfirm,
}: {
  label: string;
  year: number;
  month: number;
  isPending: boolean;
  onConfirm: () => void;
}) {
  return (
    <Dialog>
      <DialogTrigger
        render={
          <Button variant="default" size="sm" disabled={isPending} />
        }
      >
        <Lock className="mr-1 size-3" />
        Mark as Filed
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="size-5 text-amber-500" />
            Confirm {label} Filing
          </DialogTitle>
          <DialogDescription>
            You are about to mark{" "}
            <strong>
              {label} for {MONTHS[month - 1]} {year}
            </strong>{" "}
            as filed.
          </DialogDescription>
        </DialogHeader>
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          {label === "PP 30" && (
            <li>Lock the period, preventing changes to VAT amounts</li>
          )}
          <li>Record today as the filing date</li>
          <li>Set the {label} filing status to &quot;filed&quot;</li>
        </ul>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>
            Cancel
          </DialogClose>
          <DialogClose
            render={
              <Button
                variant="default"
                disabled={isPending}
                onClick={onConfirm}
              />
            }
          >
            Confirm Filing
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
