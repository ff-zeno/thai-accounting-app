"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { AlertTriangle, Check, Loader2 } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Amount } from "@/components/ui/amount";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { NativeSelect } from "@/components/ui/native-select";
import { toast } from "sonner";
import {
  confirmDocumentAction,
  rejectDocumentAction,
  updateDocumentAction,
  retryExtractionAction,
} from "./actions";

interface DocumentData {
  id: string;
  direction: "expense" | "income";
  type: string;
  documentNumber: string | null;
  issueDate: string | null;
  dueDate: string | null;
  subtotal: string | null;
  vatAmount: string | null;
  totalAmount: string | null;
  currency: string | null;
  exchangeRate: string | null;
  totalAmountThb: string | null;
  category: string | null;
  taxInvoiceSubtype: "full_ti" | "abb" | "e_tax_invoice" | "not_a_ti" | null;
  supplierTaxIdSnapshot: string | null;
  supplierBranchNumberSnapshot: string | null;
  buyerTaxIdSnapshot: string | null;
  buyerBranchNumberSnapshot: string | null;
  taxInvoiceSerialNumber: string | null;
  taxInvoiceWords: string | null;
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
  entityType: string | null;
  country: string | null;
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
  const formRef = useRef<HTMLFormElement>(null);

  const confidence = doc.aiConfidence ? parseFloat(doc.aiConfidence) : null;
  const isLowConfidence = confidence !== null && confidence < 0.7;
  const isConfirmed = doc.status === "confirmed";
  const isForeignVendor =
    vendor?.entityType === "foreign" || (vendor?.country ?? "TH") !== "TH";
  const isRecoverableTaxInvoice =
    doc.taxInvoiceSubtype === "full_ti" || doc.taxInvoiceSubtype === "e_tax_invoice";
  const hasRecoverableVat = Number(doc.vatAmount ?? 0) > 0;
  const missingRecoverableInvoiceEvidence =
    !isConfirmed &&
    doc.direction === "expense" &&
    isRecoverableTaxInvoice &&
    hasRecoverableVat &&
    !(
      (doc.taxInvoiceWords?.includes("ใบกำกับภาษี") ||
        /tax\s*invoice/i.test(doc.taxInvoiceWords ?? "")) &&
      (doc.taxInvoiceSerialNumber ?? doc.documentNumber)?.trim() &&
      (doc.supplierTaxIdSnapshot ?? vendor?.taxId)?.trim() &&
      doc.supplierBranchNumberSnapshot?.trim() &&
      doc.buyerTaxIdSnapshot?.trim() &&
      doc.buyerBranchNumberSnapshot?.trim()
    );

  const handleSave = async (formData: FormData) => {
    setSaving(true);
    try {
      const result = await updateDocumentAction(doc.id, {
        type: formData.get("type") as
          | "invoice"
          | "receipt"
          | "debit_note"
          | "credit_note"
          | "wht_certificate_received",
        documentNumber: formData.get("documentNumber") as string,
        issueDate: formData.get("issueDate") as string,
        dueDate: formData.get("dueDate") as string,
        subtotal: formData.get("subtotal") as string,
        vatAmount: formData.get("vatAmount") as string,
        totalAmount: formData.get("totalAmount") as string,
        currency: formData.get("currency") as string,
        exchangeRate: formData.get("exchangeRate") as string,
        totalAmountThb: formData.get("totalAmountThb") as string,
        category: formData.get("category") as string,
        taxInvoiceSubtype: (formData.get("taxInvoiceSubtype") as
          | "full_ti"
          | "abb"
          | "e_tax_invoice"
          | "not_a_ti"
          | "") || null,
        supplierTaxIdSnapshot: formData.get("supplierTaxIdSnapshot") as string,
        supplierBranchNumberSnapshot: formData.get(
          "supplierBranchNumberSnapshot"
        ) as string,
        buyerTaxIdSnapshot: formData.get("buyerTaxIdSnapshot") as string,
        buyerBranchNumberSnapshot: formData.get(
          "buyerBranchNumberSnapshot"
        ) as string,
        taxInvoiceSerialNumber: formData.get("taxInvoiceSerialNumber") as string,
        taxInvoiceWords: formData.get("taxInvoiceWords") as string,
        isPp36Subject: formData.get("isPp36Subject") === "on",
      }, doc.updatedAt ?? undefined);
      if (!result.success) {
        toast.error(result.error ?? "Failed to save");
        return false;
      }
      toast.success("Document updated");
      return true;
    } catch {
      toast.error("Failed to save");
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handleConfirm = async () => {
    setConfirming(true);
    try {
      if (formRef.current) {
        const saved = await handleSave(new FormData(formRef.current));
        if (!saved) return;
      }
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
          <div className="flex items-center gap-2 rounded-md bg-warning/10 p-2 text-sm text-warning">
            <AlertTriangle className="size-4" />
            {tr("lowConfidence")}
          </div>
        )}
        {doc.reviewNotes && (
          <Alert variant="destructive">
            <AlertTriangle />
            <AlertDescription>{doc.reviewNotes}</AlertDescription>
          </Alert>
        )}
      </div>

      {/* Form */}
      <form
        ref={formRef}
        action={async (formData) => {
          await handleSave(formData);
        }}
        className="flex-1 space-y-4 p-4"
      >
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
            {isForeignVendor && (
              <div className="mt-2 space-y-2">
                <Badge variant="secondary">
                  Foreign vendor {vendor.country ? `(${vendor.country})` : ""}
                </Badge>
                <Alert variant="warning">
                  <AlertDescription className="text-xs">
                    Review PP36 self-assessed VAT and foreign withholding treatment before confirming this document.
                  </AlertDescription>
                </Alert>
              </div>
            )}
          </div>
        )}

        {/* Document type */}
        <div>
          <Label htmlFor="type">{t("type")}</Label>
          <NativeSelect
            name="type"
            id="type"
            defaultValue={doc.type}
            disabled={isConfirmed}
            className="mt-1 w-full"
          >
            <option value="invoice">{t("invoice")}</option>
            <option value="receipt">{t("receipt")}</option>
            <option value="debit_note">{t("debitNote")}</option>
            <option value="credit_note">{t("creditNote")}</option>
            <option value="wht_certificate_received">50 Tawi received</option>
          </NativeSelect>
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
              className="tabular-nums"
            />
          </div>
          <div>
            <Label htmlFor="vatAmount">{t("vatAmount")}</Label>
            <Input
              name="vatAmount"
              id="vatAmount"
              defaultValue={doc.vatAmount ?? ""}
              disabled={isConfirmed}
              className="tabular-nums"
            />
          </div>
          <div>
            <Label htmlFor="totalAmount">{t("totalAmount")}</Label>
            <Input
              name="totalAmount"
              id="totalAmount"
              defaultValue={doc.totalAmount ?? ""}
              disabled={isConfirmed}
              className="tabular-nums"
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <Label htmlFor="currency">Currency</Label>
            <Input
              name="currency"
              id="currency"
              defaultValue={doc.currency ?? "THB"}
              disabled={isConfirmed}
              className="font-mono uppercase"
              maxLength={3}
            />
          </div>
          <div>
            <Label htmlFor="exchangeRate">Reviewed FX rate</Label>
            <Input
              name="exchangeRate"
              id="exchangeRate"
              defaultValue={doc.exchangeRate ?? ""}
              disabled={isConfirmed}
              className="tabular-nums"
              placeholder="e.g. 36.250000"
            />
          </div>
          <div>
            <Label htmlFor="totalAmountThb">Reviewed THB base</Label>
            <Input
              name="totalAmountThb"
              id="totalAmountThb"
              defaultValue={doc.totalAmountThb ?? ""}
              disabled={isConfirmed}
              className="tabular-nums"
              placeholder="Required for foreign PP36"
            />
          </div>
        </div>

        <div>
          <Label htmlFor="category">Category</Label>
          <Input
            name="category"
            id="category"
            defaultValue={doc.category ?? ""}
            disabled={isConfirmed}
            placeholder="foreign_service, royalty, professional_fee, goods_import"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="taxInvoiceSubtype">Tax invoice type</Label>
            <NativeSelect
              name="taxInvoiceSubtype"
              id="taxInvoiceSubtype"
              defaultValue={doc.taxInvoiceSubtype ?? ""}
              disabled={isConfirmed}
              className="mt-1 w-full"
            >
              <option value="">Select type</option>
              <option value="full_ti">Full tax invoice</option>
              <option value="e_tax_invoice">E-tax invoice</option>
              <option value="abb">ABB / abbreviated</option>
              <option value="not_a_ti">Not a tax invoice</option>
            </NativeSelect>
          </div>
          <div>
            <Label htmlFor="taxInvoiceSerialNumber">Tax invoice serial #</Label>
            <Input
              name="taxInvoiceSerialNumber"
              id="taxInvoiceSerialNumber"
              defaultValue={doc.taxInvoiceSerialNumber ?? doc.documentNumber ?? ""}
              disabled={isConfirmed}
            />
          </div>
          <div>
            <Label htmlFor="taxInvoiceWords">Tax invoice wording</Label>
            <Input
              name="taxInvoiceWords"
              id="taxInvoiceWords"
              defaultValue={doc.taxInvoiceWords ?? ""}
              placeholder="Tax Invoice / ใบกำกับภาษี"
              disabled={isConfirmed}
            />
          </div>
          <div>
            <Label htmlFor="supplierTaxIdSnapshot">Supplier tax ID</Label>
            <Input
              name="supplierTaxIdSnapshot"
              id="supplierTaxIdSnapshot"
              defaultValue={doc.supplierTaxIdSnapshot ?? vendor?.taxId ?? ""}
              disabled={isConfirmed}
            />
          </div>
          <div>
            <Label htmlFor="supplierBranchNumberSnapshot">Supplier branch</Label>
            <Input
              name="supplierBranchNumberSnapshot"
              id="supplierBranchNumberSnapshot"
              defaultValue={doc.supplierBranchNumberSnapshot ?? ""}
              disabled={isConfirmed}
            />
          </div>
          <div>
            <Label htmlFor="buyerTaxIdSnapshot">Buyer tax ID</Label>
            <Input
              name="buyerTaxIdSnapshot"
              id="buyerTaxIdSnapshot"
              defaultValue={doc.buyerTaxIdSnapshot ?? ""}
              disabled={isConfirmed}
            />
          </div>
          <div>
            <Label htmlFor="buyerBranchNumberSnapshot">Buyer branch</Label>
            <Input
              name="buyerBranchNumberSnapshot"
              id="buyerBranchNumberSnapshot"
              defaultValue={doc.buyerBranchNumberSnapshot ?? ""}
              disabled={isConfirmed}
            />
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

        {missingRecoverableInvoiceEvidence && (
          <Alert variant="warning">
            <AlertTriangle />
            <AlertTitle>Ask supplier for a full tax invoice</AlertTitle>
            <AlertDescription className="text-xs">
              Recoverable input VAT needs full tax invoice wording, serial
              number, supplier tax ID and branch, and buyer tax ID and branch.
            </AlertDescription>
          </Alert>
        )}

        {/* Line items */}
        {lineItems.length > 0 && (
          <div>
            <Label className="mb-2 block">{t("lineItems")}</Label>
            <div className="space-y-2">
              {lineItems.map((item, i) => (
                <div key={item.id} className="rounded-md border p-2 text-sm">
                  <div className="flex justify-between">
                    <span>{item.description || `Item ${i + 1}`}</span>
                    <Amount value={item.amount} nullDash />
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
        <div className="flex items-center gap-2 border-t p-4">
          <Check className="size-4 text-success" />
          <span className="text-sm font-medium text-success">
            {t("confirmed")}
          </span>
          <div className="ml-auto flex gap-2">
            <Button
              variant="outline"
              size="sm"
              render={
                <Link
                  href={
                    doc.direction === "expense"
                      ? "/documents/expenses"
                      : "/documents/income"
                  }
                />
              }
            >
              View documents
            </Button>
            <Button size="sm" render={<Link href="/reconciliation" />}>
              Go to reconciliation
            </Button>
          </div>
        </div>
      )}

    </div>
  );
}
