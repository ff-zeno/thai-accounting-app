"use client";

import { useState, useTransition } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
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
  loadFilingDataAction,
  markAsFiledAction,
  voidFilingAction,
} from "./actions";
import {
  RefreshCw,
  Lock,
  Unlock,
  AlertTriangle,
  Calendar,
  FileText,
} from "lucide-react";

type FormType = "pnd3" | "pnd53" | "pnd54";

interface CertificateRow {
  id: string;
  certificateNo: string;
  paymentDate: string | null;
  totalBaseAmount: string | null;
  totalWht: string | null;
  status: string;
  vendorId: string;
  vendorName: string;
  vendorNameTh: string | null;
  vendorTaxId: string | null;
}

interface Filing {
  id: string;
  formType: "pnd3" | "pnd53" | "pnd54";
  totalBaseAmount: string | null;
  totalWhtAmount: string | null;
  status: "draft" | "filed" | "paid";
  filingDate: string | null;
  deadline: string | null;
  periodLocked: boolean | null;
}

interface VendorGroup {
  vendorId: string;
  vendorName: string;
  vendorNameTh: string | null;
  vendorTaxId: string | null;
  certificates: CertificateRow[];
  totalBase: number;
  totalWht: number;
}

const FORM_TYPE_LABELS: Record<FormType, string> = {
  pnd3: "PND 3",
  pnd53: "PND 53",
  pnd54: "PND 54",
};

const FORM_TYPE_DESCRIPTIONS: Record<FormType, string> = {
  pnd3: "Individual payees",
  pnd53: "Corporate payees",
  pnd54: "Foreign remittance",
};

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

function getStatusVariant(status: string) {
  switch (status) {
    case "filed":
      return "default" as const;
    case "paid":
      return "default" as const;
    default:
      return "secondary" as const;
  }
}

function groupByVendor(certificates: CertificateRow[]): VendorGroup[] {
  const map = new Map<string, VendorGroup>();

  for (const cert of certificates) {
    const existing = map.get(cert.vendorId);
    if (existing) {
      existing.certificates.push(cert);
      existing.totalBase += parseFloat(cert.totalBaseAmount ?? "0");
      existing.totalWht += parseFloat(cert.totalWht ?? "0");
    } else {
      map.set(cert.vendorId, {
        vendorId: cert.vendorId,
        vendorName: cert.vendorName,
        vendorNameTh: cert.vendorNameTh,
        vendorTaxId: cert.vendorTaxId,
        certificates: [cert],
        totalBase: parseFloat(cert.totalBaseAmount ?? "0"),
        totalWht: parseFloat(cert.totalWht ?? "0"),
      });
    }
  }

  return Array.from(map.values()).sort((a, b) =>
    a.vendorName.localeCompare(b.vendorName)
  );
}

export function FilingView() {
  const currentDate = new Date();
  const [year, setYear] = useState(currentDate.getFullYear());
  const [month, setMonth] = useState(currentDate.getMonth() + 1);
  const [activeTab, setActiveTab] = useState<FormType>("pnd3");
  const [isPending, startTransition] = useTransition();
  const [filings, setFilings] = useState<Filing[]>([]);
  const [certificatesByFormType, setCertificatesByFormType] = useState<
    Record<FormType, CertificateRow[]>
  >({ pnd3: [], pnd53: [], pnd54: [] });
  const [loaded, setLoaded] = useState(false);

  function handleLoadData() {
    startTransition(async () => {
      const result = await loadFilingDataAction(year, month);
      if ("error" in result) return;
      setFilings(result.filings as Filing[]);
      setCertificatesByFormType(
        result.certificatesByFormType as Record<FormType, CertificateRow[]>
      );
      setLoaded(true);
    });
  }

  function handleMarkAsFiled(filingId: string) {
    startTransition(async () => {
      await markAsFiledAction(filingId);
      handleLoadData();
    });
  }

  function handleVoidFiling(filingId: string) {
    startTransition(async () => {
      await voidFilingAction(filingId);
      handleLoadData();
    });
  }

  const years = Array.from(
    { length: 5 },
    (_, i) => currentDate.getFullYear() - 2 + i
  );

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
            <p>Select a period and click Load Period to view filing data.</p>
          </CardContent>
        </Card>
      )}

      {loaded && (
        <Tabs
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as FormType)}
        >
          <TabsList>
            {(["pnd3", "pnd53", "pnd54"] as FormType[]).map((ft) => {
              const filing = filings.find((f) => f.formType === ft);
              const certCount =
                certificatesByFormType[ft]?.length ?? 0;
              return (
                <TabsTrigger key={ft} value={ft}>
                  {FORM_TYPE_LABELS[ft]}
                  {certCount > 0 && (
                    <Badge variant="secondary" className="ml-1.5">
                      {certCount}
                    </Badge>
                  )}
                  {filing?.periodLocked && (
                    <Lock className="ml-1 size-3 text-amber-500" />
                  )}
                </TabsTrigger>
              );
            })}
          </TabsList>

          {(["pnd3", "pnd53", "pnd54"] as FormType[]).map((ft) => (
            <TabsContent key={ft} value={ft}>
              <FilingTabContent
                formType={ft}
                filing={filings.find((f) => f.formType === ft) ?? null}
                vendorGroups={groupByVendor(certificatesByFormType[ft])}
                certCount={certificatesByFormType[ft]?.length ?? 0}
                isPending={isPending}
                onMarkAsFiled={handleMarkAsFiled}
                onVoidFiling={handleVoidFiling}
                year={year}
                month={month}
              />
            </TabsContent>
          ))}
        </Tabs>
      )}
    </div>
  );
}

function FilingTabContent({
  formType,
  filing,
  vendorGroups,
  certCount,
  isPending,
  onMarkAsFiled,
  onVoidFiling,
  year,
  month,
}: {
  formType: FormType;
  filing: Filing | null;
  vendorGroups: VendorGroup[];
  certCount: number;
  isPending: boolean;
  onMarkAsFiled: (id: string) => void;
  onVoidFiling: (id: string) => void;
  year: number;
  month: number;
}) {
  const status = filing?.status ?? "draft";
  const isLocked = filing?.periodLocked ?? false;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              {FORM_TYPE_LABELS[formType]}
              <span className="text-sm font-normal text-muted-foreground">
                {FORM_TYPE_DESCRIPTIONS[formType]}
              </span>
            </CardTitle>
            <div className="mt-1 flex items-center gap-3 text-sm text-muted-foreground">
              <span>
                Period: {MONTHS[month - 1]} {year}
              </span>
              {filing?.deadline && (
                <span className="flex items-center gap-1">
                  <FileText className="size-3" />
                  Deadline: {filing.deadline}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={getStatusVariant(status)}>
              {isLocked && <Lock className="mr-1 size-3" />}
              {status.charAt(0).toUpperCase() + status.slice(1)}
            </Badge>
            {filing && status === "draft" && certCount > 0 && (
              <MarkAsFiledDialog
                filingId={filing.id}
                formType={formType}
                year={year}
                month={month}
                isPending={isPending}
                onConfirm={onMarkAsFiled}
              />
            )}
            {filing && status === "filed" && (
              <VoidFilingDialog
                filingId={filing.id}
                formType={formType}
                isPending={isPending}
                onConfirm={onVoidFiling}
              />
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {vendorGroups.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground">
            No certificates for this period and form type.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Vendor</TableHead>
                <TableHead>Tax ID</TableHead>
                <TableHead>Certificates</TableHead>
                <TableHead className="text-right">Base Amount</TableHead>
                <TableHead className="text-right">WHT Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {vendorGroups.map((group) => (
                <TableRow key={group.vendorId}>
                  <TableCell>
                    <div>
                      <div className="font-medium">{group.vendorName}</div>
                      {group.vendorNameTh && (
                        <div className="text-xs text-muted-foreground">
                          {group.vendorNameTh}
                        </div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {group.vendorTaxId ?? "-"}
                  </TableCell>
                  <TableCell>{group.certificates.length}</TableCell>
                  <TableCell className="text-right font-mono">
                    {formatAmount(group.totalBase.toFixed(2))}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {formatAmount(group.totalWht.toFixed(2))}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell colSpan={2} className="font-medium">
                  Total
                </TableCell>
                <TableCell className="font-medium">{certCount}</TableCell>
                <TableCell className="text-right font-mono font-medium">
                  {formatAmount(filing?.totalBaseAmount ?? "0.00")}
                </TableCell>
                <TableCell className="text-right font-mono font-medium">
                  {formatAmount(filing?.totalWhtAmount ?? "0.00")}
                </TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Confirmation dialogs
// ---------------------------------------------------------------------------

function MarkAsFiledDialog({
  filingId,
  formType,
  year,
  month,
  isPending,
  onConfirm,
}: {
  filingId: string;
  formType: FormType;
  year: number;
  month: number;
  isPending: boolean;
  onConfirm: (id: string) => void;
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
            Confirm Filing
          </DialogTitle>
          <DialogDescription>
            You are about to mark{" "}
            <strong>
              {FORM_TYPE_LABELS[formType]} for {MONTHS[month - 1]} {year}
            </strong>{" "}
            as filed. This will:
          </DialogDescription>
        </DialogHeader>
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          <li>Lock the period, preventing changes to documents and certificates dated in this month</li>
          <li>Record today as the filing date</li>
          <li>Set the filing status to &quot;filed&quot;</li>
        </ul>
        <p className="text-sm text-muted-foreground">
          To make changes after filing, you will need to void the filing first.
        </p>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>
            Cancel
          </DialogClose>
          <DialogClose
            render={
              <Button
                variant="default"
                disabled={isPending}
                onClick={() => onConfirm(filingId)}
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

function VoidFilingDialog({
  filingId,
  formType,
  isPending,
  onConfirm,
}: {
  filingId: string;
  formType: FormType;
  isPending: boolean;
  onConfirm: (id: string) => void;
}) {
  return (
    <Dialog>
      <DialogTrigger
        render={
          <Button variant="destructive" size="sm" disabled={isPending} />
        }
      >
        <Unlock className="mr-1 size-3" />
        Void Filing
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="size-5 text-destructive" />
            Void Filing
          </DialogTitle>
          <DialogDescription>
            You are about to void the{" "}
            <strong>{FORM_TYPE_LABELS[formType]}</strong> filing. This will:
          </DialogDescription>
        </DialogHeader>
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          <li>Unlock the period, allowing edits to documents and certificates</li>
          <li>Reset the filing status to &quot;draft&quot;</li>
          <li>Clear the filing date</li>
        </ul>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>
            Cancel
          </DialogClose>
          <DialogClose
            render={
              <Button
                variant="destructive"
                disabled={isPending}
                onClick={() => onConfirm(filingId)}
              />
            }
          >
            Void Filing
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
