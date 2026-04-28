"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DatePicker } from "@/components/ui/date-picker";
import { Autocomplete } from "@/components/ui/autocomplete";
import {
  DOCUMENT_CATEGORIES,
  getCategoryLabel,
} from "@/lib/categories/document-categories";
import { useLocale } from "next-intl";
import {
  Loader2,
  Paperclip,
  FileText,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  CheckCircle2,
  XCircle,
} from "lucide-react";
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
      taxInvoiceSubtype?: "full_ti" | "abb" | "e_tax_invoice" | "not_a_ti" | null;
      isPp36Subject?: boolean | null;
      vendorId?: string | null;
      vendorName?: string | null;
      confirm?: boolean;
      extractionAccepted?: boolean;
    }
  ) => Promise<{ success?: boolean; error?: string }>;
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
  taxInvoiceSubtype: "full_ti" | "abb" | "e_tax_invoice" | "not_a_ti" | "";
  isPp36Subject: boolean;
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
    taxInvoiceSubtype: doc.taxInvoiceSubtype ?? "",
    isPp36Subject: doc.isPp36Subject ?? false,
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
}: Props) {
  const t = useTranslations("documents");
  const tc = useTranslations("common");
  const locale = useLocale();

  const categoryOptions = useMemo(
    () =>
      DOCUMENT_CATEGORIES.map((c) => ({
        value: c.value,
        label: getCategoryLabel(c, locale),
        keywords: [c.labelEn, c.labelTh, ...(c.aliases ?? [])],
      })),
    [locale]
  );

  const [doc, setDoc] = useState<DocumentDetail | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [initialForm, setInitialForm] = useState<FormState | null>(null);
  const [explicitVerdict, setExplicitVerdict] = useState<
    "accurate" | "needs_fixes" | null
  >(null);
  const [isSaving, startSaveTransition] = useTransition();

  // Compute dirty state: form differs from what was loaded.
  const isDirty =
    form && initialForm
      ? (Object.keys(form) as (keyof FormState)[]).some(
          (k) => form[k] !== initialForm[k]
        )
      : false;

  // Verdict is derived: user pick wins if "needs_fixes", otherwise dirty
  // state forces "needs_fixes", otherwise honor explicit "accurate".
  const extractionVerdict: "accurate" | "needs_fixes" | null = isDirty
    ? "needs_fixes"
    : explicitVerdict;

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
        const formState = docToForm(result);
        setForm(formState);
        setInitialForm(formState);
        setExplicitVerdict(null);
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
      setInitialForm(null);
      setExplicitVerdict(null);
    }
  }

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  function handleSave() {
    if (!docId || !form) return;
    // Default verdict on save: accurate if untouched, needs_fixes if edited.
    const verdict =
      extractionVerdict ?? (isDirty ? "needs_fixes" : "accurate");
    startSaveTransition(async () => {
      const result = await onSave(docId, {
        type: form.type as "invoice" | "receipt" | "debit_note" | "credit_note",
        documentNumber: form.documentNumber || null,
        issueDate: form.issueDate || null,
        dueDate: form.dueDate || null,
        subtotal: form.subtotal || null,
        vatAmount: form.vatAmount || null,
        totalAmount: form.totalAmount || null,
        currency: form.currency || null,
        category: form.category || null,
        taxInvoiceSubtype: form.taxInvoiceSubtype || null,
        isPp36Subject: form.isPp36Subject,
        vendorId: form.vendorId,
        vendorName: form.vendorName.trim() || null,
        confirm: true,
        extractionAccepted: verdict === "accurate",
      });
      if (result && "error" in result && result.error) {
        return;
      }
      onClose();
      setDoc(null);
      setForm(null);
      setInitialForm(null);
      setExplicitVerdict(null);
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
      <SheetContent className="w-full data-[side=right]:sm:max-w-xl data-[side=right]:lg:max-w-2xl data-[side=right]:xl:max-w-3xl overflow-y-auto">
        {isLoading ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : doc && form ? (
          <>
            {/* Header — reserve right padding so close X doesn't overlap title */}
            <SheetHeader className="pr-10">
              <SheetTitle className="flex flex-wrap items-center gap-2">
                {doc.documentNumber || t("documentDetails")}
                <Badge variant="outline" className="capitalize text-xs">
                  {doc.type.replace("_", " ")}
                </Badge>
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
                  <Select
                    // `items` maps raw values to labels so SelectValue renders
                    // the pretty label instead of the underscored DB value.
                    items={{
                      invoice: t("invoice"),
                      receipt: t("receipt"),
                      debit_note: t("debitNote"),
                      credit_note: t("creditNote"),
                    }}
                    value={form.type}
                    onValueChange={(v) => v && updateField("type", v)}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="invoice">{t("invoice")}</SelectItem>
                      <SelectItem value="receipt">{t("receipt")}</SelectItem>
                      <SelectItem value="debit_note">
                        {t("debitNote")}
                      </SelectItem>
                      <SelectItem value="credit_note">
                        {t("creditNote")}
                      </SelectItem>
                    </SelectContent>
                  </Select>
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
                  <DatePicker
                    value={form.issueDate}
                    onChange={(v) => updateField("issueDate", v)}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">
                    {t("dueDate")}
                  </label>
                  <DatePicker
                    value={form.dueDate}
                    onChange={(v) => updateField("dueDate", v)}
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  {t("category")}
                </label>
                <Autocomplete
                  value={form.category}
                  onChange={(v) => updateField("category", v)}
                  options={categoryOptions}
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
                    Tax invoice type
                  </label>
                  <select
                    value={form.taxInvoiceSubtype}
                    onChange={(e) =>
                      updateField(
                        "taxInvoiceSubtype",
                        e.target.value as FormState["taxInvoiceSubtype"]
                      )
                    }
                    className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                  >
                    <option value="">Select type</option>
                    <option value="full_ti">Full tax invoice</option>
                    <option value="e_tax_invoice">E-tax invoice</option>
                    <option value="abb">ABB / abbreviated</option>
                    <option value="not_a_ti">Not a tax invoice</option>
                  </select>
                </div>
              </div>

              <label className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.isPp36Subject}
                  onChange={(e) => updateField("isPp36Subject", e.target.checked)}
                />
                PP36 foreign service
              </label>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">
                    {t("vendorName")}
                  </label>
                  <Input
                    value={form.vendorName}
                    onChange={(e) => updateField("vendorName", e.target.value)}
                    placeholder={t("vendorName")}
                  />
                  {form.vendorId && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Editing renames the linked vendor&apos;s display label.
                    </p>
                  )}
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
                  <div className="grid grid-cols-2 gap-3">
                    {doc.files.map((file) => {
                      const isPdf = file.fileType === "application/pdf";
                      const isImage = file.fileType?.startsWith("image/");
                      const src = `/api/files/${file.id}`;
                      return (
                        <a
                          key={file.id}
                          href={src}
                          target="_blank"
                          rel="noreferrer"
                          className="group relative flex h-40 flex-col overflow-hidden rounded-md border transition-colors hover:border-primary/50 hover:bg-accent"
                          title={file.originalFilename || "File"}
                        >
                          <div className="relative flex flex-1 items-center justify-center bg-muted/30">
                            {isImage ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={src}
                                alt={file.originalFilename || "File"}
                                className="absolute inset-0 size-full object-cover"
                              />
                            ) : isPdf ? (
                              <FileText className="size-14 text-muted-foreground/70" />
                            ) : (
                              <Paperclip className="size-14 text-muted-foreground/70" />
                            )}
                          </div>
                          <div className="flex items-baseline justify-between gap-2 border-t bg-background px-2 py-1.5">
                            <p className="truncate text-xs font-medium">
                              {file.originalFilename || "File"}
                            </p>
                            {file.pageNumber && (
                              <p className="shrink-0 text-xs text-muted-foreground">
                                p.{file.pageNumber}
                              </p>
                            )}
                          </div>
                          <ExternalLink className="absolute right-1 top-1 size-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                        </a>
                      );
                    })}
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

              {/* Extraction quality review — shown only on first review.
                  Once saved (doc.status === "confirmed"), we never ask again.
                  Subsequent edits silently flip the signal via isDirty at save. */}
              {doc.status !== "confirmed" && (
                <div>
                  <h3 className="mb-1 text-sm font-medium">
                    Was the AI extraction accurate?
                  </h3>
                  <p className="mb-3 text-xs text-muted-foreground">
                    Optional. Helps us learn which documents needed human
                    corrections.
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      disabled={isDirty}
                      onClick={() => setExplicitVerdict("accurate")}
                      className={`flex h-14 items-center justify-center gap-2 rounded-md border-2 text-sm font-medium transition-colors ${
                        extractionVerdict === "accurate"
                          ? "border-green-500 bg-green-500/10 text-green-700 dark:text-green-400"
                          : "border-border bg-background text-muted-foreground hover:border-green-500/40 hover:bg-green-500/5"
                      } disabled:cursor-not-allowed disabled:opacity-50`}
                    >
                      <CheckCircle2 className="size-5" />
                      Accurate
                    </button>
                    <button
                      type="button"
                      onClick={() => setExplicitVerdict("needs_fixes")}
                      className={`flex h-14 items-center justify-center gap-2 rounded-md border-2 text-sm font-medium transition-colors ${
                        extractionVerdict === "needs_fixes"
                          ? "border-red-500 bg-red-500/10 text-red-700 dark:text-red-400"
                          : "border-border bg-background text-muted-foreground hover:border-red-500/40 hover:bg-red-500/5"
                      }`}
                    >
                      <XCircle className="size-5" />
                      Needs fixes
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Footer — single action merges old Save + Confirm */}
            <SheetFooter>
              <Button onClick={handleSave} disabled={isSaving}>
                {isSaving ? (
                  <>
                    <Loader2 className="mr-1 size-4 animate-spin" />
                    {tc("loading")}
                  </>
                ) : (
                  "Save & Close"
                )}
              </Button>
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
