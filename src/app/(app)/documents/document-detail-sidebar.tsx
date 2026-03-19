"use client";

import { useEffect, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Paperclip, ChevronDown, ChevronRight } from "lucide-react";
import { getDocumentDetailsAction } from "./actions";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type DocumentDetail = NonNullable<
  Awaited<ReturnType<typeof getDocumentDetailsAction>>
>;

interface Props {
  docId: string | null;
  open: boolean;
  onClose: () => void;
  onSave: (
    docId: string,
    data: {
      type?: "invoice" | "receipt" | "debit_note" | "credit_note";
      documentNumber?: string | null;
      issueDate?: string | null;
      dueDate?: string | null;
      subtotal?: string | null;
      vatAmount?: string | null;
      totalAmount?: string | null;
      currency?: string | null;
      category?: string | null;
      vendorId?: string | null;
      vendorName?: string | null;
    }
  ) => Promise<{ success?: boolean; error?: string }>;
  onConfirm: (docId: string) => Promise<{ success?: boolean; error?: string }>;
}

// ---------------------------------------------------------------------------
// Form State
// ---------------------------------------------------------------------------

interface FormState {
  type: string;
  documentNumber: string;
  issueDate: string;
  dueDate: string;
  category: string;
  subtotal: string;
  vatAmount: string;
  totalAmount: string;
  currency: string;
  vendorName: string;
  vendorId: string | null;
}

function docToForm(doc: DocumentDetail): FormState {
  return {
    type: doc.type,
    documentNumber: doc.documentNumber ?? "",
    issueDate: doc.issueDate ?? "",
    dueDate: doc.dueDate ?? "",
    category: doc.category ?? "",
    subtotal: doc.subtotal ?? "",
    vatAmount: doc.vatAmount ?? "",
    totalAmount: doc.totalAmount ?? "",
    currency: doc.currency ?? "THB",
    vendorName:
      doc.vendor?.displayAlias ?? doc.vendor?.name ?? doc.vendor?.nameTh ?? "",
    vendorId: doc.vendorId,
  };
}

// ---------------------------------------------------------------------------
// Reconciliation Match Row
// ---------------------------------------------------------------------------

function ReconMatchRow({
  match,
}: {
  match: DocumentDetail["reconciliationMatches"][number];
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded border p-2">
      <button
        className="flex w-full items-center gap-2 text-left text-sm"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? (
          <ChevronDown className="size-3.5 shrink-0" />
        ) : (
          <ChevronRight className="size-3.5 shrink-0" />
        )}
        <span className="flex-1 truncate">
          {match.transactionDate} &mdash;{" "}
          {match.transactionDescription || "Transaction"}
        </span>
        <span className="font-mono text-xs">
          {match.matchedAmount
            ? parseFloat(match.matchedAmount).toLocaleString(undefined, {
                minimumFractionDigits: 2,
              })
            : "—"}
        </span>
      </button>
      {expanded && (
        <div className="mt-2 space-y-1 border-t pt-2 text-xs text-muted-foreground">
          <div className="flex justify-between">
            <span>Bank</span>
            <span>
              {match.bankCode} — {match.bankAccountName || "—"}
            </span>
          </div>
          <div className="flex justify-between">
            <span>Amount</span>
            <span className="font-mono">
              {match.transactionAmount
                ? parseFloat(match.transactionAmount).toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                  })
                : "—"}{" "}
              ({match.transactionType})
            </span>
          </div>
          <div className="flex justify-between">
            <span>Match Type</span>
            <Badge variant="outline" className="text-xs">
              {match.matchType}
            </Badge>
          </div>
          {match.confidence && (
            <div className="flex justify-between">
              <span>Confidence</span>
              <span>{Math.round(parseFloat(match.confidence) * 100)}%</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Sidebar
// ---------------------------------------------------------------------------

export function DocumentDetailSidebar({
  docId,
  open,
  onClose,
  onSave,
  onConfirm,
}: Props) {
  const t = useTranslations("documents");
  const tc = useTranslations("common");

  const [doc, setDoc] = useState<DocumentDetail | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [isSaving, startSaveTransition] = useTransition();

  // Derive loading state: open with a docId but no doc loaded yet
  const isLoading = open && docId !== null && doc === null;

  // Fetch document details when docId changes
  useEffect(() => {
    if (!docId) return;

    let cancelled = false;
    getDocumentDetailsAction(docId).then((result) => {
      if (cancelled) return;
      if (result) {
        setDoc(result);
        setForm(docToForm(result));
      }
    });

    return () => {
      cancelled = true;
    };
  }, [docId]);

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      onClose();
      setDoc(null);
      setForm(null);
    }
  }

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  function handleSave() {
    if (!docId || !form) return;
    startSaveTransition(async () => {
      await onSave(docId, {
        type: form.type as "invoice" | "receipt" | "debit_note" | "credit_note",
        documentNumber: form.documentNumber || null,
        issueDate: form.issueDate || null,
        dueDate: form.dueDate || null,
        subtotal: form.subtotal || null,
        vatAmount: form.vatAmount || null,
        totalAmount: form.totalAmount || null,
        currency: form.currency || null,
        category: form.category || null,
        vendorId: form.vendorId,
        vendorName: !form.vendorId && form.vendorName ? form.vendorName : null,
      });
      // Refetch to get updated state
      const updated = await getDocumentDetailsAction(docId);
      if (updated) {
        setDoc(updated);
        setForm(docToForm(updated));
      }
    });
  }

  function handleConfirm() {
    if (!docId) return;
    startSaveTransition(async () => {
      await onConfirm(docId);
      const updated = await getDocumentDetailsAction(docId);
      if (updated) {
        setDoc(updated);
        setForm(docToForm(updated));
      }
    });
  }

  const reconCount = doc?.reconciliationMatches?.length ?? 0;
  const reconTotal = doc?.reconciliationMatches?.reduce(
    (sum, m) => sum + parseFloat(m.matchedAmount || "0"),
    0
  ) ?? 0;
  const docTotal = parseFloat(doc?.totalAmount || "0");
  const isFullMatch =
    reconCount > 0 && docTotal > 0 && Math.abs(reconTotal - docTotal) < 0.01;

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent className="sm:max-w-2xl overflow-y-auto">
        {isLoading ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : doc && form ? (
          <>
            {/* Header */}
            <SheetHeader>
              <SheetTitle className="flex items-center gap-2">
                {doc.documentNumber || t("documentDetails")}
                <Badge variant="outline" className="capitalize text-xs">
                  {doc.type.replace("_", " ")}
                </Badge>
                <StatusBadge status={doc.status} needsReview={doc.needsReview} />
              </SheetTitle>
              <SheetDescription>
                {doc.aiConfidence && (
                  <span className="text-xs">
                    AI Confidence:{" "}
                    <span
                      className={
                        parseFloat(doc.aiConfidence) >= 0.9
                          ? "text-green-600"
                          : parseFloat(doc.aiConfidence) >= 0.7
                            ? "text-yellow-600"
                            : "text-red-600"
                      }
                    >
                      {Math.round(parseFloat(doc.aiConfidence) * 100)}%
                    </span>
                  </span>
                )}
              </SheetDescription>
            </SheetHeader>

            {/* Editable Form */}
            <div className="space-y-4 px-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">
                    {t("type")}
                  </label>
                  <select
                    value={form.type}
                    onChange={(e) => updateField("type", e.target.value)}
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
                  >
                    <option value="invoice">{t("invoice")}</option>
                    <option value="receipt">{t("receipt")}</option>
                    <option value="debit_note">{t("debitNote")}</option>
                    <option value="credit_note">{t("creditNote")}</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">
                    {t("documentNumber")}
                  </label>
                  <Input
                    value={form.documentNumber}
                    onChange={(e) =>
                      updateField("documentNumber", e.target.value)
                    }
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">
                    {t("issueDate")}
                  </label>
                  <Input
                    type="date"
                    value={form.issueDate}
                    onChange={(e) => updateField("issueDate", e.target.value)}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">
                    {t("dueDate")}
                  </label>
                  <Input
                    type="date"
                    value={form.dueDate}
                    onChange={(e) => updateField("dueDate", e.target.value)}
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  {t("category")}
                </label>
                <Input
                  value={form.category}
                  onChange={(e) => updateField("category", e.target.value)}
                  placeholder={t("category")}
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">
                    {t("subtotal")}
                  </label>
                  <Input
                    value={form.subtotal}
                    onChange={(e) => updateField("subtotal", e.target.value)}
                    className="font-mono"
                    inputMode="decimal"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">
                    {t("vatAmount")}
                  </label>
                  <Input
                    value={form.vatAmount}
                    onChange={(e) => updateField("vatAmount", e.target.value)}
                    className="font-mono"
                    inputMode="decimal"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">
                    {t("totalAmount")}
                  </label>
                  <Input
                    value={form.totalAmount}
                    onChange={(e) => updateField("totalAmount", e.target.value)}
                    className="font-mono"
                    inputMode="decimal"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">
                    {t("currency")}
                  </label>
                  <Input
                    value={form.currency}
                    onChange={(e) => updateField("currency", e.target.value)}
                    maxLength={3}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">
                    {t("vendorName")}
                  </label>
                  <Input
                    value={form.vendorName}
                    onChange={(e) => {
                      updateField("vendorName", e.target.value);
                      // Clear vendorId when user types a new name
                      if (form.vendorId) {
                        updateField("vendorId", null);
                      }
                    }}
                    placeholder={t("vendorName")}
                  />
                </div>
              </div>

              {/* Attached Files */}
              <div>
                <h3 className="mb-2 text-sm font-medium">
                  {t("attachedFiles")}
                  {doc.files.length > 0 && (
                    <span className="ml-1 text-muted-foreground">
                      ({doc.files.length})
                    </span>
                  )}
                </h3>
                {doc.files.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    {t("noDocuments")}
                  </p>
                ) : (
                  <div className="grid grid-cols-3 gap-2">
                    {doc.files.map((file) => (
                      <div
                        key={file.id}
                        className="rounded border p-2 text-center"
                      >
                        <Paperclip className="mx-auto mb-1 size-6 text-muted-foreground" />
                        <p className="truncate text-xs">
                          {file.originalFilename || "File"}
                        </p>
                        {file.pageNumber && (
                          <p className="text-xs text-muted-foreground">
                            p.{file.pageNumber}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Reconciliation */}
              <div>
                <h3 className="mb-2 flex items-center gap-2 text-sm font-medium">
                  {t("reconMatches")}
                  {reconCount > 0 && (
                    <Badge
                      variant={isFullMatch ? "default" : "outline"}
                      className="text-xs"
                    >
                      {isFullMatch ? t("matched") : t("partial")}
                    </Badge>
                  )}
                </h3>
                {reconCount === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    {t("noReconMatches")}
                  </p>
                ) : (
                  <div className="space-y-2">
                    {doc.reconciliationMatches.map((match) => (
                      <ReconMatchRow key={match.id} match={match} />
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Footer Actions */}
            <SheetFooter>
              <Button onClick={handleSave} disabled={isSaving}>
                {isSaving ? (
                  <>
                    <Loader2 className="mr-1 size-4 animate-spin" />
                    {tc("loading")}
                  </>
                ) : (
                  t("saveChanges")
                )}
              </Button>
              {doc.status === "draft" && (
                <Button
                  variant="outline"
                  onClick={handleConfirm}
                  disabled={isSaving}
                >
                  {tc("confirm")}
                </Button>
              )}
            </SheetFooter>
          </>
        ) : (
          <div className="flex h-full items-center justify-center">
            <p className="text-sm text-muted-foreground">
              {t("noDocuments")}
            </p>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// Local helper (same as in document-table)
// ---------------------------------------------------------------------------

function StatusBadge({
  status,
  needsReview,
}: {
  status: string;
  needsReview: boolean | null;
}) {
  const t = useTranslations("documents");

  if (status === "draft" && needsReview) {
    return <Badge variant="secondary">{t("needsReview")}</Badge>;
  }
  if (status === "confirmed") {
    return <Badge variant="default">{t("confirmed")}</Badge>;
  }
  if (status === "voided") {
    return <Badge variant="destructive">{t("voided")}</Badge>;
  }
  return <Badge variant="outline">{status}</Badge>;
}
