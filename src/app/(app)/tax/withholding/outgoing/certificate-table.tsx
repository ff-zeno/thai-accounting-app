"use client";

import { useState, useTransition } from "react";
import { AlertTriangle, Download, FileText, Loader2, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Amount } from "@/components/ui/amount";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TableCard } from "@/components/ui/table-card";
import { generateCertificatePdfAction, reissueCertificateAction } from "./actions";
import {
  toBuddhistYear,
  formatThaiDateShort,
} from "@/lib/utils/thai-date";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CertificateRow {
  id: string;
  certificateNo: string;
  formType: "pnd2" | "pnd3" | "pnd53" | "pnd54";
  paymentDate: string | null;
  issuedDate: string | null;
  totalBaseAmount: string | null;
  totalWht: string | null;
  status: "draft" | "issued" | "voided" | "replaced";
  pdfUrl: string | null;
  rateBelowDefaultAcknowledgedAt: Date | string | null;
  rateBelowDefaultStatutoryRate: string | null;
  rateBelowDefaultSelectedRate: string | null;
  rateBelowDefaultRationale: string | null;
  vendorName: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const FORM_TYPE_LABELS: Record<string, string> = {
  pnd2: "PND 2",
  pnd3: "PND 3",
  pnd53: "PND 53",
  pnd54: "PND 54",
};

function formatCertNoDisplay(certNo: string): string {
  const parts = certNo.split("/");
  if (parts.length === 3) {
    const yearNum = parseInt(parts[1], 10);
    if (!isNaN(yearNum)) {
      parts[1] = String(toBuddhistYear(yearNum));
    }
  }
  return parts.join("/");
}

function formatPercent(value: string | null): string {
  if (!value) return "-";
  const num = Number(value);
  if (!Number.isFinite(num)) return "-";
  return `${(num * 100).toFixed(2)}%`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CertificateTable({
  certificates,
}: {
  certificates: CertificateRow[];
}) {
  const [formTypeFilter, setFormTypeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [reissuingId, setReissuingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const filtered = certificates.filter((cert) => {
    if (formTypeFilter !== "all" && cert.formType !== formTypeFilter) {
      return false;
    }
    if (statusFilter !== "all" && cert.status !== statusFilter) {
      return false;
    }
    return true;
  });

  function handleGeneratePdf(certId: string) {
    setGeneratingId(certId);
    startTransition(async () => {
      const result = await generateCertificatePdfAction(certId);
      setGeneratingId(null);
      if (result.error) {
        toast.error(result.error);
      } else if (result.url) {
        toast.success("PDF generated successfully");
        window.open(result.url, "_blank");
      }
    });
  }

  function handleReissue(certId: string, reason: string) {
    setReissuingId(certId);
    startTransition(async () => {
      const result = await reissueCertificateAction(certId, reason);
      setReissuingId(null);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success(`Replacement certificate ${result.certificateNo} created`);
        window.location.reload();
      }
    });
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex items-center gap-3">
        <Select value={formTypeFilter} onValueChange={(v) => setFormTypeFilter(v ?? "all")}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Form type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All forms</SelectItem>
            <SelectItem value="pnd2">PND 2</SelectItem>
            <SelectItem value="pnd3">PND 3</SelectItem>
            <SelectItem value="pnd53">PND 53</SelectItem>
            <SelectItem value="pnd54">PND 54</SelectItem>
          </SelectContent>
        </Select>

        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v ?? "all")}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="issued">Issued</SelectItem>
            <SelectItem value="voided">Voided</SelectItem>
            <SelectItem value="replaced">Replaced</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <TableCard tone="tax">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
            <FileText className="size-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              No WHT certificates found
            </p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Certificate No.</TableHead>
                <TableHead>Vendor</TableHead>
                <TableHead>Form</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Base Amount</TableHead>
                <TableHead className="text-right">WHT</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Rate Review</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((cert) => (
                <TableRow key={cert.id}>
                  <TableCell className="font-mono text-xs">
                    {formatCertNoDisplay(cert.certificateNo)}
                  </TableCell>
                  <TableCell>{cert.vendorName}</TableCell>
                  <TableCell>
                    <Badge variant="outline">
                      {FORM_TYPE_LABELS[cert.formType] ?? cert.formType}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {cert.paymentDate
                      ? formatThaiDateShort(cert.paymentDate)
                      : "-"}
                  </TableCell>
                  <TableCell className="text-right">
                    <Amount value={cert.totalBaseAmount} nullDash />
                  </TableCell>
                  <TableCell className="text-right">
                    <Amount value={cert.totalWht} nullDash />
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={cert.status} />
                  </TableCell>
                  <TableCell>
                    {cert.rateBelowDefaultAcknowledgedAt ? (
                      <div className="space-y-1">
                        <Badge variant="outline" className="gap-1">
                          <AlertTriangle className="size-3" />
                          Below default
                        </Badge>
                        <div className="text-xs text-muted-foreground">
                          {formatPercent(cert.rateBelowDefaultSelectedRate)} vs{" "}
                          {formatPercent(cert.rateBelowDefaultStatutoryRate)}
                        </div>
                        {cert.rateBelowDefaultRationale ? (
                          <div className="max-w-[220px] truncate text-xs text-muted-foreground">
                            {cert.rateBelowDefaultRationale}
                          </div>
                        ) : null}
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">Default ok</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-2">
                      {cert.pdfUrl ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => window.open(cert.pdfUrl!, "_blank")}
                        >
                          <Download className="mr-1 size-3" />
                          Download
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={
                            isPending && generatingId === cert.id
                          }
                          onClick={() => handleGeneratePdf(cert.id)}
                        >
                          {isPending && generatingId === cert.id ? (
                            <>
                              <Loader2 className="mr-1 size-3 animate-spin" />
                              Generating...
                            </>
                          ) : (
                            <>
                              <FileText className="mr-1 size-3" />
                              Generate PDF
                            </>
                          )}
                        </Button>
                      )}
                      {cert.status !== "voided" && cert.status !== "replaced" && (
                        <ReissueDialog
                          certificateNo={cert.certificateNo}
                          disabled={isPending && reissuingId === cert.id}
                          onConfirm={(reason) => handleReissue(cert.id, reason)}
                        />
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </TableCard>
    </div>
  );
}

function ReissueDialog({
  certificateNo,
  disabled,
  onConfirm,
}: {
  certificateNo: string;
  disabled: boolean;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");

  return (
    <Dialog>
      <DialogTrigger render={<Button variant="outline" size="sm" disabled={disabled} />}>
        {disabled ? (
          <Loader2 className="mr-1 size-3 animate-spin" />
        ) : (
          <RotateCcw className="mr-1 size-3" />
        )}
        Reissue
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="size-5 text-warning" />
            Reissue Certificate
          </DialogTitle>
          <DialogDescription>
            Create a replacement for {formatCertNoDisplay(certificateNo)}. The
            original certificate will be marked as replaced and retained for audit.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor={`reissue-${certificateNo}`}>Reason</Label>
          <Textarea
            id={`reissue-${certificateNo}`}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            className="min-h-24"
            placeholder="Correction requested by payee..."
          />
        </div>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>
            Cancel
          </DialogClose>
          <DialogClose
            render={
              <Button
                disabled={disabled || reason.trim().length === 0}
                onClick={() => onConfirm(reason)}
              />
            }
          >
            Create Replacement
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
