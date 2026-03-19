"use client";

import { useState, useTransition } from "react";
import { Download, FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { generateCertificatePdfAction } from "./actions";
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
  formType: "pnd3" | "pnd53" | "pnd54";
  paymentDate: string | null;
  issuedDate: string | null;
  totalBaseAmount: string | null;
  totalWht: string | null;
  status: "draft" | "issued" | "voided" | "replaced";
  pdfUrl: string | null;
  vendorName: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const FORM_TYPE_LABELS: Record<string, string> = {
  pnd3: "PND 3",
  pnd53: "PND 53",
  pnd54: "PND 54",
};

const STATUS_VARIANT: Record<
  string,
  "default" | "secondary" | "destructive" | "outline"
> = {
  draft: "secondary",
  issued: "default",
  voided: "destructive",
  replaced: "outline",
};

function formatAmount(value: string | null): string {
  if (!value) return "-";
  const num = parseFloat(value);
  if (isNaN(num)) return "-";
  return num.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

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
              <TableHead className="text-right">PDF</TableHead>
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
                <TableCell className="text-right font-mono">
                  {formatAmount(cert.totalBaseAmount)}
                </TableCell>
                <TableCell className="text-right font-mono">
                  {formatAmount(cert.totalWht)}
                </TableCell>
                <TableCell>
                  <Badge variant={STATUS_VARIANT[cert.status] ?? "secondary"}>
                    {cert.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
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
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
