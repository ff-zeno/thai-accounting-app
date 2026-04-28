"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { AlertTriangle, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  confirmDocumentAction,
  rejectDocumentAction,
  updateDocumentAction,
  retryExtractionAction,
} from "./actions";

interface DocumentData {
  id: string;
  type: string;
  documentNumber: string | null;
  issueDate: string | null;
  dueDate: string | null;
  subtotal: string | null;
  vatAmount: string | null;
  totalAmount: string | null;
  currency: string | null;
  taxInvoiceSubtype: "full_ti" | "abb" | "e_tax_invoice" | "not_a_ti" | null;
  isPp36Subject: boolean | null;
  status: string;
  needsReview: boolean | null;
  aiConfidence: string | null;
  reviewNotes: string | null;
  detectedLanguage: string | null;
  updatedAt: string | null;
}

interface VendorData {
  id: string;
  name: string;
  nameTh: string | null;
  displayAlias: string | null;
  taxId: string | null;
}

interface LineItem {
  id: string;
  description: string | null;
  quantity: string | null;
  unitPrice: string | null;
  amount: string | null;
  vatAmount: string | null;
  whtType: string | null;
}

export function ExtractionForm({
  document: doc,
  vendor,
  lineItems,
}: {
  document: DocumentData;
  vendor: VendorData | null;
  lineItems: LineItem[];
}) {
  const t = useTranslations("documents");
  const tr = useTranslations("review");
  const tc = useTranslations("common");

  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const confidence = doc.aiConfidence ? parseFloat(doc.aiConfidence) : null;
  const isLowConfidence = confidence !== null && confidence < 0.7;
  const isConfirmed = doc.status === "confirmed";

  const handleSave = async (formData: FormData) => {
    setSaving(true);
    try {
      await updateDocumentAction(doc.id, {
        type: formData.get("type") as "invoice" | "receipt" | "debit_note" | "credit_note",
        documentNumber: formData.get("documentNumber") as string,
        issueDate: formData.get("issueDate") as string,
        dueDate: formData.get("dueDate") as string,
        subtotal: formData.get("subtotal") as string,
        vatAmount: formData.get("vatAmount") as string,
        totalAmount: formData.get("totalAmount") as string,
        taxInvoiceSubtype: (formData.get("taxInvoiceSubtype") as
          | "full_ti"
          | "abb"
          | "e_tax_invoice"
          | "not_a_ti"
          | "") || null,
        isPp36Subject: formData.get("isPp36Subject") === "on",
      }, doc.updatedAt ?? undefined);
      toast.success("Document updated");
    } catch {
      toast.error("Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleConfirm = async () => {
    setConfirming(true);
    try {
      const result = await confirmDocumentAction(doc.id);
      if (!result.success) {
        toast.error(result.error ?? "Failed to confirm");
        return;
      }
      toast.success("Document confirmed");
    } catch {
      toast.error("Failed to confirm");
    } finally {
      setConfirming(false);
    }
  };

  const handleReject = async () => {
    try {
      await rejectDocumentAction(doc.id, "Rejected by user during review");
      toast.success("Document rejected");
    } catch {
      toast.error("Failed to reject");
    }
  };

  const handleRetry = async () => {
    try {
      await retryExtractionAction(doc.id);
      toast.success("Extraction retry started");
    } catch {
      toast.error("Failed to retry");
    }
  };

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      {/* Header warnings */}
      <div className="space-y-2 border-b p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">{tr("dataPanel")}</h2>
          {confidence !== null && (
            <Badge
              variant={
                confidence >= 0.9
                  ? "default"
                  : confidence >= 0.7
                    ? "secondary"
                    : "destructive"
              }
            >
              {t("confidence")}: {Math.round(confidence * 100)}%
            </Badge>
          )}
        </div>
        {isLowConfidence && (
          <div className="flex items-center gap-2 rounded-md bg-yellow-50 p-2 text-sm text-yellow-800 dark:bg-yellow-950/30 dark:text-yellow-200">
            <AlertTriangle className="size-4" />
            {tr("lowConfidence")}
          </div>
        )}
        {doc.reviewNotes && (
          <div className="flex items-center gap-2 rounded-md bg-red-50 p-2 text-sm text-red-800 dark:bg-red-950/30 dark:text-red-200">
            <AlertTriangle className="size-4" />
            {doc.reviewNotes}
          </div>
        )}
      </div>

      {/* Form */}
      <form action={handleSave} className="flex-1 space-y-4 p-4">
        {/* Vendor */}
        {vendor && (
          <div className="rounded-md border p-3">
            <Label className="text-xs text-muted-foreground">{t("vendor")}</Label>
            <p className="font-medium">{vendor.displayAlias || vendor.name}</p>
            {vendor.nameTh && (
              <p className="text-sm text-muted-foreground">{vendor.nameTh}</p>
            )}
            {vendor.taxId && (
              <p className="text-xs text-muted-foreground">Tax ID: {vendor.taxId}</p>
            )}
          </div>
        )}

        {/* Document type */}
        <div>
          <Label htmlFor="type">{t("type")}</Label>
          <select
            name="type"
            id="type"
            defaultValue={doc.type}
            disabled={isConfirmed}
            className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
          >
            <option value="invoice">{t("invoice")}</option>
            <option value="receipt">{t("receipt")}</option>
            <option value="debit_note">{t("debitNote")}</option>
            <option value="credit_note">{t("creditNote")}</option>
          </select>
        </div>

        {/* Document number + dates */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="documentNumber">{t("documentNumber")}</Label>
            <Input
              name="documentNumber"
              id="documentNumber"
              defaultValue={doc.documentNumber ?? ""}
              disabled={isConfirmed}
            />
          </div>
          <div>
            <Label htmlFor="issueDate">{t("issueDate")}</Label>
            <Input
              name="issueDate"
              id="issueDate"
              type="date"
              defaultValue={doc.issueDate ?? ""}
              disabled={isConfirmed}
            />
          </div>
          <div>
            <Label htmlFor="dueDate">{t("dueDate")}</Label>
            <Input
              name="dueDate"
              id="dueDate"
              type="date"
              defaultValue={doc.dueDate ?? ""}
              disabled={isConfirmed}
            />
          </div>
        </div>

        {/* Amounts */}
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <Label htmlFor="subtotal">{t("subtotal")}</Label>
            <Input
              name="subtotal"
              id="subtotal"
              defaultValue={doc.subtotal ?? ""}
              disabled={isConfirmed}
              className="font-mono"
            />
          </div>
          <div>
            <Label htmlFor="vatAmount">{t("vatAmount")}</Label>
            <Input
              name="vatAmount"
              id="vatAmount"
              defaultValue={doc.vatAmount ?? ""}
              disabled={isConfirmed}
              className="font-mono"
            />
          </div>
          <div>
            <Label htmlFor="totalAmount">{t("totalAmount")}</Label>
            <Input
              name="totalAmount"
              id="totalAmount"
              defaultValue={doc.totalAmount ?? ""}
              disabled={isConfirmed}
              className="font-mono"
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="taxInvoiceSubtype">Tax invoice type</Label>
            <select
              name="taxInvoiceSubtype"
              id="taxInvoiceSubtype"
              defaultValue={doc.taxInvoiceSubtype ?? ""}
              disabled={isConfirmed}
              className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
            >
              <option value="">Select type</option>
              <option value="full_ti">Full tax invoice</option>
              <option value="e_tax_invoice">E-tax invoice</option>
              <option value="abb">ABB / abbreviated</option>
              <option value="not_a_ti">Not a tax invoice</option>
            </select>
          </div>
          <label className="flex items-center gap-2 self-end rounded-md border px-3 py-2 text-sm">
            <input
              type="checkbox"
              name="isPp36Subject"
              defaultChecked={doc.isPp36Subject ?? false}
              disabled={isConfirmed}
            />
            PP36 foreign service
          </label>
        </div>

        {/* Line items */}
        {lineItems.length > 0 && (
          <div>
            <Label className="mb-2 block">{t("lineItems")}</Label>
            <div className="space-y-2">
              {lineItems.map((item, i) => (
                <div key={item.id} className="rounded-md border p-2 text-sm">
                  <div className="flex justify-between">
                    <span>{item.description || `Item ${i + 1}`}</span>
                    <span className="font-mono">
                      {item.amount ? parseFloat(item.amount).toLocaleString(undefined, { minimumFractionDigits: 2 }) : "—"}
                    </span>
                  </div>
                  {(item.quantity || item.unitPrice) && (
                    <div className="mt-1 text-xs text-muted-foreground">
                      {item.quantity && `Qty: ${item.quantity}`}
                      {item.unitPrice && ` x ${item.unitPrice}`}
                      {item.whtType && ` | WHT: ${item.whtType}`}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Actions */}
        {!isConfirmed && (
          <div className="flex gap-2 border-t pt-4">
            <Button type="submit" disabled={saving} className="flex-1">
              {saving ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <Check className="mr-2 size-4" />
              )}
              {tc("save")}
            </Button>
          </div>
        )}
      </form>

      {/* Bottom actions */}
      {!isConfirmed && (
        <div className="flex gap-2 border-t p-4">
          <Button onClick={handleConfirm} disabled={confirming} className="flex-1">
            {confirming && <Loader2 className="mr-2 size-4 animate-spin" />}
            {tr("confirmExtraction")}
          </Button>
          <Button variant="outline" onClick={handleReject}>
            {tr("rejectExtraction")}
          </Button>
          <Button variant="ghost" onClick={handleRetry}>
            {tr("retryExtraction")}
          </Button>
        </div>
      )}

      {isConfirmed && (
        <div className="flex items-center gap-2 border-t p-4 text-green-600">
          <Check className="size-4" />
          <span className="text-sm font-medium">{t("confirmed")}</span>
        </div>
      )}
    </div>
  );
}
