import { and, eq, isNull, desc, sql, or, like, lt, gte, lte, inArray, asc } from "drizzle-orm";
import { db, type DbConnection } from "../index";
import {
  documents,
  documentFiles,
  documentLineItems,
  vendors,
  reconciliationMatches,
  transactions,
  bankAccounts,
  organizations,
  establishments,
  vatInputItems,
  vatOutputItems,
} from "../schema";
import { auditMutation } from "../helpers/audit-log";
import { isPeriodLocked } from "./period-locks";
import {
  classifyForeignVendorTax,
  isPp36ServiceCategory,
} from "@/lib/tax/foreign-vendor-tax";
import { materializeWhtCreditReceivedFromDocument } from "./wht-credits-received";
import { getVatRate } from "./tax-config";

type TaxInvoiceSubtype = "full_ti" | "abb" | "e_tax_invoice" | "not_a_ti";
type DocumentType =
  | "invoice"
  | "receipt"
  | "debit_note"
  | "credit_note"
  | "wht_certificate_received";
type VatTreatment =
  | "no_vat"
  | "input_vat"
  | "output_vat"
  | "exempt"
  | "not_claimable"
  | "pp36";

function moneyToNumber(value: string | null): number | null {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isDomesticVendor(vendor: { entityType: string; country: string | null }) {
  return vendor.entityType !== "foreign" && (vendor.country ?? "TH") === "TH";
}

function deriveVatPeriod(issueDate: string | Date): {
  vatPeriodYear: number;
  vatPeriodMonth: number;
} {
  if (issueDate instanceof Date) {
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Bangkok",
      year: "numeric",
      month: "2-digit",
    });
    const parts = formatter.formatToParts(issueDate);
    const year = Number(parts.find((part) => part.type === "year")?.value);
    const month = Number(parts.find((part) => part.type === "month")?.value);
    if (!Number.isInteger(year) || !Number.isInteger(month)) {
      throw new Error("Cannot confirm document: issue date is invalid");
    }
    return { vatPeriodYear: year, vatPeriodMonth: month };
  }

  const match = /^(\d{4})-(\d{2})-\d{2}$/.exec(issueDate);
  if (!match) {
    throw new Error("Cannot confirm document: issue date is invalid");
  }
  const vatPeriodYear = Number(match[1]);
  const vatPeriodMonth = Number(match[2]);
  if (vatPeriodMonth < 1 || vatPeriodMonth > 12) {
    throw new Error("Cannot confirm document: issue date is invalid");
  }

  return {
    vatPeriodYear,
    vatPeriodMonth,
  };
}

function isRecoverableTaxInvoiceSubtype(subtype: TaxInvoiceSubtype | null) {
  return subtype === "full_ti" || subtype === "e_tax_invoice";
}

function requiredText(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : null;
}

function hasTaxInvoiceWords(value: string | null | undefined) {
  const text = value?.trim() ?? "";
  return /tax\s*invoice/i.test(text) || text.includes("ใบกำกับภาษี");
}

export class DocumentConfirmationError extends Error {
  constructor(public readonly issues: string[]) {
    super(`Cannot confirm document: ${issues.join("; ")}`);
    this.name = "DocumentConfirmationError";
  }
}

export async function validateDocumentForConfirmation(
  orgId: string,
  docId: string,
  tx?: DbConnection
) {
  const doc = await getDocumentWithDetails(orgId, docId, tx);
  if (!doc) {
    throw new DocumentConfirmationError(["document not found"]);
  }

  const issues: string[] = [];
  const incomingWhtCertificate = doc.type === "wht_certificate_received";
  if (incomingWhtCertificate && doc.direction !== "income") {
    issues.push("incoming WHT certificate must be filed under income");
  }
  if (!doc.issueDate) {
    issues.push(incomingWhtCertificate ? "payment date is required" : "issue date is required");
  }
  if (!doc.vendorId || !doc.vendor) issues.push("vendor is required");
  if (!doc.documentNumber?.trim()) {
    issues.push("document number is required");
  }
  if (doc.subtotal == null && !incomingWhtCertificate) issues.push("subtotal is required");
  if (doc.vatAmount == null && !incomingWhtCertificate) {
    issues.push("VAT amount is required, use 0.00 when none");
  }
  if (doc.totalAmount == null) issues.push("total amount is required");
  if (
    (doc.type === "credit_note" || doc.type === "debit_note") &&
    !doc.relatedDocumentId
  ) {
    issues.push("credit/debit notes must link to the original document");
  }

  const subtotal = moneyToNumber(doc.subtotal);
  const vatAmount = moneyToNumber(doc.vatAmount);
  const totalAmount = moneyToNumber(doc.totalAmount);
  if (doc.subtotal != null && subtotal == null) issues.push("subtotal is invalid");
  if (doc.vatAmount != null && vatAmount == null) issues.push("VAT amount is invalid");
  if (doc.totalAmount != null && totalAmount == null) issues.push("total amount is invalid");
  if (subtotal != null && subtotal < 0) issues.push("subtotal cannot be negative");
  if (vatAmount != null && vatAmount < 0) issues.push("VAT amount cannot be negative");
  if (totalAmount != null && totalAmount < 0) issues.push("total amount cannot be negative");

  let vatPeriodYear: number | null = null;
  let vatPeriodMonth: number | null = null;
  if (doc.issueDate) {
    const period = deriveVatPeriod(doc.issueDate);
    vatPeriodYear = period.vatPeriodYear;
    vatPeriodMonth = period.vatPeriodMonth;
    if (
      (await isPeriodLocked(orgId, "vat", vatPeriodYear, vatPeriodMonth)) ||
      (await isPeriodLocked(orgId, "vat_pp30", vatPeriodYear, vatPeriodMonth)) ||
      (await isPeriodLocked(orgId, "vat_pp36", vatPeriodYear, vatPeriodMonth))
    ) {
      issues.push(`VAT period ${vatPeriodMonth}/${vatPeriodYear} is locked`);
    }
  }

  if (doc.vendor && vatAmount != null && vatAmount > 0) {
    if (doc.direction === "expense" && isDomesticVendor(doc.vendor)) {
      if (!doc.taxInvoiceSubtype) {
        issues.push("VAT-bearing expense requires tax invoice subtype");
      }
      if (isRecoverableTaxInvoiceSubtype(doc.taxInvoiceSubtype)) {
        if (!doc.vendor.isVatRegistered) {
          issues.push("recoverable input VAT requires a VAT-registered vendor");
        }
        if (!doc.vendor.taxId?.trim()) {
          issues.push("recoverable input VAT requires vendor tax ID");
        }
        if (!doc.vendor.branchNumber?.trim()) {
          issues.push("recoverable input VAT requires vendor branch number");
        }
      }
    }
  }

  const requiresFullTaxInvoiceEvidence =
    vatAmount != null &&
    vatAmount > 0 &&
    isRecoverableTaxInvoiceSubtype(doc.taxInvoiceSubtype);
  const [org] = requiresFullTaxInvoiceEvidence
    ? await (tx ?? db)
        .select({
          taxId: organizations.taxId,
          branchNumber: organizations.branchNumber,
        })
        .from(organizations)
        .where(and(eq(organizations.id, orgId), isNull(organizations.deletedAt)))
        .limit(1)
    : [null];
  const fullTaxInvoiceSnapshots = requiresFullTaxInvoiceEvidence
      ? {
          supplierTaxIdSnapshot: requiredText(
            doc.supplierTaxIdSnapshot ?? doc.vendor?.taxId
          ),
          supplierBranchNumberSnapshot: requiredText(
            doc.supplierBranchNumberSnapshot ?? doc.vendor?.branchNumber
          ),
          buyerTaxIdSnapshot: requiredText(doc.buyerTaxIdSnapshot ?? org?.taxId),
          buyerBranchNumberSnapshot: requiredText(
            doc.buyerBranchNumberSnapshot ?? org?.branchNumber
          ),
          taxInvoiceSerialNumber: requiredText(
            doc.taxInvoiceSerialNumber ?? doc.documentNumber
          ),
          taxInvoiceWords: requiredText(doc.taxInvoiceWords),
        }
      : null;

  if (requiresFullTaxInvoiceEvidence) {
    if (!fullTaxInvoiceSnapshots?.supplierTaxIdSnapshot) {
      issues.push("recoverable tax invoice requires supplier tax ID");
    }
    if (!fullTaxInvoiceSnapshots?.supplierBranchNumberSnapshot) {
      issues.push("recoverable tax invoice requires supplier branch number");
    }
    if (!fullTaxInvoiceSnapshots?.buyerTaxIdSnapshot) {
      issues.push("recoverable tax invoice requires buyer tax ID");
    }
    if (!fullTaxInvoiceSnapshots?.buyerBranchNumberSnapshot) {
      issues.push("recoverable tax invoice requires buyer branch number");
    }
    if (!fullTaxInvoiceSnapshots?.taxInvoiceSerialNumber) {
      issues.push("recoverable tax invoice requires tax invoice serial number");
    }
    if (!hasTaxInvoiceWords(fullTaxInvoiceSnapshots?.taxInvoiceWords)) {
      issues.push('recoverable tax invoice wording must include "Tax Invoice" or "ใบกำกับภาษี"');
    }
  }

  const foreignTax = classifyForeignVendorTax({
    direction: doc.direction,
    vendorCountry: doc.vendor?.country,
    vendorEntityType: doc.vendor?.entityType,
    category: doc.category,
    isPp36Subject: doc.isPp36Subject,
    issueDate: doc.issueDate,
    subtotal: doc.subtotal,
    totalAmount: doc.totalAmount,
    totalAmountThb: doc.totalAmountThb,
    exchangeRate: doc.exchangeRate,
    currency: doc.currency,
  });
  const isPp36Subject = foreignTax.pp36Required;
  if (doc.direction === "expense" && foreignTax.isForeignVendor && subtotal != null && subtotal > 0) {
    issues.push(...foreignTax.blockingReasons);
  }

  const whtLineItems = doc.lineItems.filter(
    (line) => moneyToNumber(line.whtAmount) != null && moneyToNumber(line.whtAmount)! > 0
  );
  if (incomingWhtCertificate && whtLineItems.length === 0) {
    issues.push("incoming WHT certificate requires withheld amount");
  }
  if (whtLineItems.length > 0 && !incomingWhtCertificate) {
    for (const line of whtLineItems) {
      if (!line.rdPaymentTypeCode?.trim()) {
        issues.push("WHT line items require RD payment type code");
        break;
      }
    }
  }

  if (issues.length > 0 || !doc.vendor || (!incomingWhtCertificate && vatAmount == null)) {
    throw new DocumentConfirmationError(issues);
  }

  return {
    doc,
    confirmationPatch: {
      status: "confirmed" as const,
      needsReview: false,
      vatPeriodYear,
      vatPeriodMonth,
      taxInvoiceSubtype:
        vatAmount != null && vatAmount > 0 ? doc.taxInvoiceSubtype : "not_a_ti",
      supplierTaxIdSnapshot: fullTaxInvoiceSnapshots?.supplierTaxIdSnapshot ?? null,
      supplierBranchNumberSnapshot:
        fullTaxInvoiceSnapshots?.supplierBranchNumberSnapshot ?? null,
      buyerTaxIdSnapshot: fullTaxInvoiceSnapshots?.buyerTaxIdSnapshot ?? null,
      buyerBranchNumberSnapshot:
        fullTaxInvoiceSnapshots?.buyerBranchNumberSnapshot ?? null,
      taxInvoiceSerialNumber:
        fullTaxInvoiceSnapshots?.taxInvoiceSerialNumber ?? null,
      taxInvoiceWords: fullTaxInvoiceSnapshots?.taxInvoiceWords ?? null,
      isPp36Subject:
        isPp36Subject ||
        Boolean(foreignTax.isForeignVendor && isPp36ServiceCategory(doc.category)),
    },
  };
}

export async function getDocumentsByOrg(
  orgId: string,
  direction: "expense" | "income",
  limit = 50,
  offset = 0
) {
  return db
    .select({
      id: documents.id,
      type: documents.type,
      documentNumber: documents.documentNumber,
      issueDate: documents.issueDate,
      totalAmount: documents.totalAmount,
      currency: documents.currency,
      status: documents.status,
      needsReview: documents.needsReview,
      aiConfidence: documents.aiConfidence,
      detectedLanguage: documents.detectedLanguage,
      createdAt: documents.createdAt,
      vendorName: vendors.name,
      vendorNameTh: vendors.nameTh,
      vendorDisplayAlias: vendors.displayAlias,
    })
    .from(documents)
    .leftJoin(
      vendors,
      and(eq(documents.vendorId, vendors.id), eq(documents.orgId, vendors.orgId))
    )
    .where(
      and(
        eq(documents.orgId, orgId),
        eq(documents.direction, direction),
        isNull(documents.deletedAt)
      )
    )
    .orderBy(desc(documents.createdAt))
    .limit(limit)
    .offset(offset);
}

export async function getDocumentById(orgId: string, id: string, tx?: DbConnection) {
  const conn = tx ?? db;
  const results = await conn
    .select()
    .from(documents)
    .where(
      and(
        eq(documents.id, id),
        eq(documents.orgId, orgId),
        isNull(documents.deletedAt)
      )
    )
    .limit(1);
  return results[0] ?? null;
}

export async function getDocumentWithDetails(
  orgId: string,
  id: string,
  tx?: DbConnection
) {
  const conn = tx ?? db;
  const doc = await getDocumentById(orgId, id, tx);
  if (!doc) return null;

  const [files, lineItems, vendor] = await Promise.all([
    conn
      .select()
      .from(documentFiles)
      .where(
        and(
          eq(documentFiles.documentId, id),
          eq(documentFiles.orgId, orgId),
          isNull(documentFiles.deletedAt)
        )
      )
      .orderBy(documentFiles.pageNumber),
    conn
      .select()
      .from(documentLineItems)
      .where(
        and(
          eq(documentLineItems.documentId, id),
          eq(documentLineItems.orgId, orgId),
          isNull(documentLineItems.deletedAt)
        )
      ),
    doc.vendorId
      ? conn
          .select()
          .from(vendors)
          .where(
            and(
              eq(vendors.id, doc.vendorId),
              eq(vendors.orgId, orgId),
              isNull(vendors.deletedAt)
            )
          )
          .limit(1)
          .then((r) => r[0] ?? null)
      : Promise.resolve(null),
  ]);

  return { ...doc, files, lineItems, vendor };
}

export async function createDocument(data: {
  orgId: string;
  direction: "expense" | "income";
  type?: DocumentType;
  status?: "draft" | "confirmed" | "partially_paid" | "paid" | "voided";
}) {
  const [doc] = await db
    .insert(documents)
    .values({
      orgId: data.orgId,
      direction: data.direction,
      type: data.type ?? "invoice",
      status: data.status ?? "draft",
      needsReview: true,
    })
    .returning();
  return doc;
}

export async function updateDocumentFromExtraction(
  orgId: string,
  docId: string,
  data: {
    vendorId?: string | null;
    type?: DocumentType;
    documentNumber?: string | null;
    issueDate?: string | null;
    dueDate?: string | null;
    subtotal?: string | null;
    vatAmount?: string | null;
    totalAmount?: string | null;
    currency?: string | null;
    exchangeRate?: string | null;
    totalAmountThb?: string | null;
    category?: string | null;
    vatTreatment?: VatTreatment | null;
    vatRate?: string | null;
    vatEstablishmentId?: string | null;
    vatPeriodYear?: number | null;
    vatPeriodMonth?: number | null;
    vatPeriodOverrideReason?: string | null;
    taxInvoiceSubtype?: TaxInvoiceSubtype | null;
    supplierTaxIdSnapshot?: string | null;
    supplierBranchNumberSnapshot?: string | null;
    buyerTaxIdSnapshot?: string | null;
    buyerBranchNumberSnapshot?: string | null;
    taxInvoiceSerialNumber?: string | null;
    taxInvoiceWords?: string | null;
    isPp36Subject?: boolean | null;
    detectedLanguage?: string | null;
    aiConfidence?: string | null;
    needsReview?: boolean;
    reviewNotes?: string | null;
  }
) {
  // Postgres `date` columns reject empty strings — coerce "" → null for date fields.
  const normalized = {
    ...data,
    issueDate: data.issueDate === "" ? null : data.issueDate,
    dueDate: data.dueDate === "" ? null : data.dueDate,
    currency: data.currency === "" ? null : data.currency,
    exchangeRate: data.exchangeRate === "" ? null : data.exchangeRate,
    totalAmountThb: data.totalAmountThb === "" ? null : data.totalAmountThb,
    vatRate: data.vatRate === "" ? null : data.vatRate,
    supplierTaxIdSnapshot:
      data.supplierTaxIdSnapshot === "" ? null : data.supplierTaxIdSnapshot,
    supplierBranchNumberSnapshot:
      data.supplierBranchNumberSnapshot === ""
        ? null
        : data.supplierBranchNumberSnapshot,
    buyerTaxIdSnapshot:
      data.buyerTaxIdSnapshot === "" ? null : data.buyerTaxIdSnapshot,
    buyerBranchNumberSnapshot:
      data.buyerBranchNumberSnapshot === "" ? null : data.buyerBranchNumberSnapshot,
    taxInvoiceSerialNumber:
      data.taxInvoiceSerialNumber === "" ? null : data.taxInvoiceSerialNumber,
    taxInvoiceWords: data.taxInvoiceWords === "" ? null : data.taxInvoiceWords,
  };
  if (Object.hasOwn(data, "issueDate")) {
    const issueDate = normalized.issueDate;
    const period = issueDate ? deriveVatPeriod(issueDate) : null;
    normalized.vatPeriodYear = period?.vatPeriodYear ?? null;
    normalized.vatPeriodMonth = period?.vatPeriodMonth ?? null;
  }
  if (normalized.vatEstablishmentId) {
    const [branch] = await db
      .select({ id: establishments.id })
      .from(establishments)
      .where(
        and(
          eq(establishments.id, normalized.vatEstablishmentId),
          eq(establishments.orgId, orgId),
          eq(establishments.vatRegistered, true),
          isNull(establishments.deletedAt)
        )
      )
      .limit(1);
    if (!branch) throw new Error("VAT branch is not available for this organization");
  }

  const [doc] = await db
    .update(documents)
    .set(normalized)
    .where(and(eq(documents.id, docId), eq(documents.orgId, orgId)))
    .returning();

  if (doc) {
    await auditMutation({
      orgId,
      entityType: "document",
      entityId: docId,
      action: "update",
      newValue: data as Record<string, unknown>,
    });
  }

  return doc;
}

export async function confirmDocument(
  orgId: string,
  docId: string,
  tx?: DbConnection
): Promise<typeof documents.$inferSelect | undefined> {
  if (!tx) {
    return db.transaction((innerTx) => confirmDocument(orgId, docId, innerTx));
  }
  const conn = tx ?? db;
  const { confirmationPatch } = await validateDocumentForConfirmation(orgId, docId, tx);

  const [doc] = await conn
    .update(documents)
    .set(confirmationPatch)
    .where(and(eq(documents.id, docId), eq(documents.orgId, orgId)))
    .returning();

  if (doc) {
    await materializeWhtCreditReceivedFromDocument(orgId, docId, conn);
    await auditMutation(
      {
        orgId,
        entityType: "document",
        entityId: docId,
        action: "update",
        newValue: confirmationPatch,
      },
      tx
    );
  }

  return doc;
}

export async function rejectDocument(
  orgId: string,
  docId: string,
  reason: string
) {
  const [doc] = await db
    .update(documents)
    .set({ reviewNotes: reason, needsReview: true, status: "draft" })
    .where(and(eq(documents.id, docId), eq(documents.orgId, orgId)))
    .returning();

  if (doc) {
    await auditMutation({
      orgId,
      entityType: "document",
      entityId: docId,
      action: "update",
      newValue: { status: "draft", needsReview: true, reviewNotes: reason },
    });
  }

  return doc;
}

export async function createLineItems(
  items: Array<{
    orgId: string;
    documentId: string;
    description?: string | null;
    quantity?: string | null;
    unitPrice?: string | null;
    amount?: string | null;
    vatAmount?: string | null;
    whtRate?: string | null;
    whtAmount?: string | null;
    whtType?: string | null;
    rdPaymentTypeCode?: string | null;
  }>
) {
  if (items.length === 0) return [];
  return db.insert(documentLineItems).values(items).returning();
}

export async function deleteLineItemsByDocument(
  orgId: string,
  documentId: string
) {
  await db
    .update(documentLineItems)
    .set({ deletedAt: new Date() })
    .where(
      and(
        eq(documentLineItems.documentId, documentId),
        eq(documentLineItems.orgId, orgId)
      )
    );
}

export async function bulkSoftDeleteDocuments(
  orgId: string,
  documentIds: string[],
  actorId?: string
): Promise<{ count: number }> {
  if (documentIds.length === 0) return { count: 0 };

  const now = new Date();

  const blocked = await db
    .select({ id: documents.id, status: documents.status })
    .from(documents)
    .where(
      and(
        eq(documents.orgId, orgId),
        inArray(documents.id, documentIds),
        isNull(documents.deletedAt),
        sql`${documents.status} IN ('confirmed', 'partially_paid', 'paid')`
      )
    )
    .limit(1);

  if (blocked[0]) {
    throw new Error(
      "Confirmed, partially paid, and paid documents cannot be deleted; use void/amendment workflow"
    );
  }

  // Soft-delete the documents themselves
  const deleted = await db
    .update(documents)
    .set({ deletedAt: now })
    .where(
      and(
        eq(documents.orgId, orgId),
        inArray(documents.id, documentIds),
        isNull(documents.deletedAt)
      )
    )
    .returning({ id: documents.id });

  if (deleted.length === 0) return { count: 0 };

  const deletedIds = deleted.map((d) => d.id);

  // Soft-delete related records in parallel
  await Promise.all([
    db
      .update(documentFiles)
      .set({ deletedAt: now })
      .where(
        and(
          eq(documentFiles.orgId, orgId),
          inArray(documentFiles.documentId, deletedIds),
          isNull(documentFiles.deletedAt)
        )
      ),
    db
      .update(documentLineItems)
      .set({ deletedAt: now })
      .where(
        and(
          eq(documentLineItems.orgId, orgId),
          inArray(documentLineItems.documentId, deletedIds),
          isNull(documentLineItems.deletedAt)
        )
      ),
    db
      .update(reconciliationMatches)
      .set({ deletedAt: now })
      .where(
        and(
          eq(reconciliationMatches.orgId, orgId),
          inArray(reconciliationMatches.documentId, deletedIds),
          isNull(reconciliationMatches.deletedAt)
        )
      ),
  ]);

  // Audit each deletion
  for (const row of deleted) {
    await auditMutation({
      orgId,
      entityType: "document",
      entityId: row.id,
      action: "delete",
      actorId,
    });
  }

  return { count: deleted.length };
}

export async function getDocumentCountsByStatus(
  orgId: string,
  direction: "expense" | "income"
) {
  const result = await db
    .select({
      needsReview: documents.needsReview,
      status: documents.status,
      count: sql<number>`count(*)::int`,
    })
    .from(documents)
    .where(
      and(
        eq(documents.orgId, orgId),
        eq(documents.direction, direction),
        isNull(documents.deletedAt)
      )
    )
    .groupBy(documents.needsReview, documents.status);
  return result;
}

// ---------------------------------------------------------------------------
// Search & Pagination
// ---------------------------------------------------------------------------

export interface DocumentSearchFilters {
  orgId: string;
  direction: "expense" | "income";
  search?: string;
  categories?: string[];
  vendorIds?: string[];
  statuses?: ("draft" | "confirmed" | "partially_paid" | "paid" | "voided")[];
  dateFrom?: string;
  dateTo?: string;
  sortBy?: "issueDate" | "totalAmount";
  sortDir?: "asc" | "desc";
}

interface DocumentSearchCursor {
  issueDate: string | null;
  id: string;
}

export async function searchDocuments(
  filters: DocumentSearchFilters,
  cursor?: DocumentSearchCursor,
  limit = 30
) {
  const conditions = [
    eq(documents.orgId, filters.orgId),
    eq(documents.direction, filters.direction),
    isNull(documents.deletedAt),
  ];

  if (filters.search) {
    const pattern = `%${filters.search}%`;
    conditions.push(
      or(
        like(documents.documentNumber, pattern),
        like(vendors.name, pattern),
        like(vendors.nameTh, pattern),
        like(vendors.displayAlias, pattern),
        like(documents.category, pattern)
      )!
    );
  }

  if (filters.categories && filters.categories.length > 0) {
    conditions.push(inArray(documents.category, filters.categories));
  }
  if (filters.vendorIds && filters.vendorIds.length > 0) {
    conditions.push(inArray(documents.vendorId, filters.vendorIds));
  }
  if (filters.statuses && filters.statuses.length > 0) {
    conditions.push(inArray(documents.status, filters.statuses));
  }
  if (filters.dateFrom) {
    conditions.push(gte(documents.issueDate, filters.dateFrom));
  }
  if (filters.dateTo) {
    conditions.push(lte(documents.issueDate, filters.dateTo));
  }

  // Cursor-based keyset pagination (issueDate DESC, id DESC)
  if (cursor) {
    if (cursor.issueDate) {
      conditions.push(
        or(
          lt(documents.issueDate, cursor.issueDate),
          and(
            eq(documents.issueDate, cursor.issueDate),
            lt(documents.id, cursor.id)
          )
        )!
      );
    } else {
      // Null issue dates sort last — only paginate by id
      conditions.push(
        and(isNull(documents.issueDate), lt(documents.id, cursor.id))!
      );
    }
  }

  // Subqueries for computed columns
  const fileCountSq = sql<number>`(
    SELECT count(*)::int FROM document_files
    WHERE document_files.document_id = documents.id
      AND document_files.deleted_at IS NULL
  )`.as("file_count");

  const maxWhtRateSq = sql<string | null>`(
    SELECT max(wht_rate) FROM document_line_items
    WHERE document_line_items.document_id = documents.id
      AND document_line_items.deleted_at IS NULL
  )`.as("max_wht_rate");

  const reconMatchCountSq = sql<number>`(
    SELECT count(*)::int FROM reconciliation_matches
    WHERE reconciliation_matches.document_id = documents.id
      AND reconciliation_matches.deleted_at IS NULL
  )`.as("recon_match_count");

  const reconMatchedTotalSq = sql<string | null>`(
    SELECT sum(matched_amount)::numeric(14,2)::text FROM reconciliation_matches
    WHERE reconciliation_matches.document_id = documents.id
      AND reconciliation_matches.deleted_at IS NULL
  )`.as("recon_matched_total");

  // Aggregate pipeline status: worst-case status across all files for this document.
  // Priority: failed_* > extracting/validating > uploaded > validated > completed
  const pipelineStatusSq = sql<string | null>`(
    SELECT CASE
      WHEN count(*) = 0 THEN NULL
      WHEN bool_or(pipeline_status IN ('failed_extraction', 'failed_validation')) THEN
        (SELECT pipeline_status FROM document_files df2
         WHERE df2.document_id = documents.id AND df2.deleted_at IS NULL
           AND df2.pipeline_status IN ('failed_extraction', 'failed_validation')
         LIMIT 1)
      WHEN bool_or(pipeline_status IN ('extracting', 'validating')) THEN 'extracting'
      WHEN bool_or(pipeline_status = 'uploaded') THEN 'uploaded'
      WHEN bool_or(pipeline_status = 'validated') THEN 'validated'
      ELSE 'completed'
    END
    FROM document_files
    WHERE document_files.document_id = documents.id
      AND document_files.deleted_at IS NULL
  )`.as("pipeline_status");

  const sortBy = filters.sortBy ?? "issueDate";
  const sortDir = filters.sortDir ?? "desc";

  // COALESCE issue_date for sorting: nulls last when DESC
  const issueDateSort = sql`COALESCE(${documents.issueDate}, '9999-12-31')`;

  const orderClauses =
    sortBy === "totalAmount"
      ? sortDir === "asc"
        ? [asc(documents.totalAmount), desc(documents.id)]
        : [desc(documents.totalAmount), desc(documents.id)]
      : sortDir === "asc"
        ? [asc(issueDateSort), desc(documents.id)]
        : [desc(issueDateSort), desc(documents.id)];

  const rows = await db
    .select({
      id: documents.id,
      type: documents.type,
      documentNumber: documents.documentNumber,
      issueDate: documents.issueDate,
      dueDate: documents.dueDate,
      subtotal: documents.subtotal,
      vatAmount: documents.vatAmount,
      totalAmount: documents.totalAmount,
      currency: documents.currency,
      category: documents.category,
      taxInvoiceSubtype: documents.taxInvoiceSubtype,
      isPp36Subject: documents.isPp36Subject,
      vatTreatment: documents.vatTreatment,
      vatRate: documents.vatRate,
      vatEstablishmentId: documents.vatEstablishmentId,
      vatPeriodYear: documents.vatPeriodYear,
      vatPeriodMonth: documents.vatPeriodMonth,
      status: documents.status,
      needsReview: documents.needsReview,
      aiConfidence: documents.aiConfidence,
      createdAt: documents.createdAt,
      vendorId: documents.vendorId,
      vendorName: vendors.name,
      vendorNameTh: vendors.nameTh,
      vendorDisplayAlias: vendors.displayAlias,
      fileCount: fileCountSq,
      maxWhtRate: maxWhtRateSq,
      reconMatchCount: reconMatchCountSq,
      reconMatchedTotal: reconMatchedTotalSq,
      pipelineStatus: pipelineStatusSq,
    })
    .from(documents)
    .leftJoin(
      vendors,
      and(eq(documents.vendorId, vendors.id), eq(documents.orgId, vendors.orgId))
    )
    .where(and(...conditions))
    .orderBy(...orderClauses)
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const data = hasMore ? rows.slice(0, limit) : rows;

  return {
    data,
    hasMore,
    nextCursor:
      hasMore && data.length > 0
        ? {
            issueDate: data[data.length - 1].issueDate,
            id: data[data.length - 1].id,
          }
        : null,
  };
}

export async function getDocumentForSidebar(orgId: string, docId: string) {
  const doc = await getDocumentById(orgId, docId);
  if (!doc) return null;

  const [files, lineItems, vendor, reconMatches] = await Promise.all([
    db
      .select()
      .from(documentFiles)
      .where(
        and(
          eq(documentFiles.documentId, docId),
          eq(documentFiles.orgId, orgId),
          isNull(documentFiles.deletedAt)
        )
      )
      .orderBy(documentFiles.pageNumber),
    db
      .select()
      .from(documentLineItems)
      .where(
        and(
          eq(documentLineItems.documentId, docId),
          eq(documentLineItems.orgId, orgId),
          isNull(documentLineItems.deletedAt)
        )
      ),
    doc.vendorId
      ? db
          .select()
          .from(vendors)
          .where(
            and(
              eq(vendors.id, doc.vendorId),
              eq(vendors.orgId, orgId),
              isNull(vendors.deletedAt)
            )
          )
          .limit(1)
          .then((r) => r[0] ?? null)
      : Promise.resolve(null),
    db
      .select({
        id: reconciliationMatches.id,
        matchedAmount: reconciliationMatches.matchedAmount,
        matchType: reconciliationMatches.matchType,
        confidence: reconciliationMatches.confidence,
        matchedBy: reconciliationMatches.matchedBy,
        matchedAt: reconciliationMatches.matchedAt,
        transactionId: reconciliationMatches.transactionId,
        transactionDate: transactions.date,
        transactionDescription: transactions.description,
        transactionAmount: transactions.amount,
        transactionType: transactions.type,
        bankAccountName: bankAccounts.accountName,
        bankCode: bankAccounts.bankCode,
      })
      .from(reconciliationMatches)
      .innerJoin(
        transactions,
        and(
          eq(reconciliationMatches.transactionId, transactions.id),
          eq(reconciliationMatches.orgId, transactions.orgId)
        )
      )
      .innerJoin(
        bankAccounts,
        and(
          eq(transactions.bankAccountId, bankAccounts.id),
          eq(transactions.orgId, bankAccounts.orgId)
        )
      )
      .where(
        and(
          eq(reconciliationMatches.documentId, docId),
          eq(reconciliationMatches.orgId, orgId),
          isNull(reconciliationMatches.deletedAt)
        )
      )
      .orderBy(desc(reconciliationMatches.matchedAt)),
  ]);

  return { ...doc, files, lineItems, vendor, reconciliationMatches: reconMatches };
}

/**
 * Returns the count of documents that have files still being processed
 * (pipeline_status not in completed/failed_*). Used for polling.
 */
export async function getPendingPipelineCount(
  orgId: string,
  direction: "expense" | "income"
): Promise<number> {
  const result = await db
    .select({
      count: sql<number>`count(DISTINCT documents.id)::int`,
    })
    .from(documents)
    .innerJoin(
      documentFiles,
      and(
        eq(documentFiles.documentId, documents.id),
        eq(documentFiles.orgId, documents.orgId)
      )
    )
    .where(
      and(
        eq(documents.orgId, orgId),
        eq(documents.direction, direction),
        isNull(documents.deletedAt),
        isNull(documentFiles.deletedAt),
        sql`${documentFiles.pipelineStatus} NOT IN ('completed', 'failed_extraction', 'failed_validation')`
      )
    );
  return result[0]?.count ?? 0;
}

export async function getFilterOptions(
  orgId: string,
  direction: "expense" | "income"
) {
  const [categoryRows, vendorRows] = await Promise.all([
    db
      .selectDistinct({ category: documents.category })
      .from(documents)
      .where(
        and(
          eq(documents.orgId, orgId),
          eq(documents.direction, direction),
          isNull(documents.deletedAt),
          sql`${documents.category} IS NOT NULL`
        )
      )
      .orderBy(documents.category),
    db
      .selectDistinct({
        id: vendors.id,
        name: vendors.name,
      })
      .from(documents)
      .innerJoin(
        vendors,
        and(
          eq(documents.vendorId, vendors.id),
          eq(documents.orgId, vendors.orgId)
        )
      )
      .where(
        and(
          eq(documents.orgId, orgId),
          eq(documents.direction, direction),
          isNull(documents.deletedAt)
        )
      )
      .orderBy(vendors.name),
  ]);

  return {
    categories: categoryRows
      .map((r) => r.category)
      .filter((c): c is string => c !== null),
    vendors: vendorRows,
  };
}

export async function getVatEstablishmentsForOrg(orgId: string) {
  return db
    .select({
      id: establishments.id,
      branchNumber: establishments.branchNumber,
      nameTh: establishments.nameTh,
      nameEn: establishments.nameEn,
      isHeadOffice: establishments.isHeadOffice,
    })
    .from(establishments)
    .where(
      and(
        eq(establishments.orgId, orgId),
        eq(establishments.vatRegistered, true),
        isNull(establishments.deletedAt)
      )
    )
    .orderBy(desc(establishments.isHeadOffice), establishments.branchNumber);
}

export async function bulkUpdateDocumentVat(
  orgId: string,
  documentIds: string[],
  data: {
    vatTreatment?: VatTreatment | null;
    vatRate?: string | null;
    vatEstablishmentId?: string | null;
    vatPeriodYear?: number | null;
    vatPeriodMonth?: number | null;
    vatPeriodOverrideReason?: string | null;
  },
  actorId?: string
): Promise<{ count: number }> {
  if (documentIds.length === 0) return { count: 0 };

  const filed = await db
    .select({ id: documents.id })
    .from(documents)
    .where(
      and(
        eq(documents.orgId, orgId),
        inArray(documents.id, documentIds),
        isNull(documents.deletedAt),
        sql`EXISTS (
          SELECT 1 FROM ${vatInputItems}
          WHERE ${vatInputItems.orgId} = ${documents.orgId}
            AND ${vatInputItems.sourceDocumentId} = ${documents.id}
            AND ${vatInputItems.status} = 'filed'
            AND ${vatInputItems.deletedAt} IS NULL
          UNION ALL
          SELECT 1 FROM ${vatOutputItems}
          WHERE ${vatOutputItems.orgId} = ${documents.orgId}
            AND ${vatOutputItems.sourceDocumentId} = ${documents.id}
            AND ${vatOutputItems.status} = 'filed'
            AND ${vatOutputItems.deletedAt} IS NULL
        )`
      )
    )
    .limit(1);
  if (filed[0]) {
    throw new Error("Filed PP30 VAT lines cannot be changed; correction/amendment required");
  }

  if (data.vatEstablishmentId) {
    const [branch] = await getVatEstablishmentsForOrg(orgId).then((branches) =>
      branches.filter((branch) => branch.id === data.vatEstablishmentId)
    );
    if (!branch) throw new Error("VAT branch is not available for this organization");
  }

  // Callers no longer send a hard-coded rate: when a VAT-bearing treatment is
  // set without an explicit rate, resolve the effective-dated statutory rate
  // server-side (tax_config).
  let vatRate = data.vatRate === "" ? null : data.vatRate;
  if (
    vatRate === undefined &&
    (data.vatTreatment === "input_vat" ||
      data.vatTreatment === "output_vat" ||
      data.vatTreatment === "pp36")
  ) {
    vatRate = await getVatRate();
  }

  const patch = {
    vatTreatment: data.vatTreatment,
    vatRate,
    vatEstablishmentId: data.vatEstablishmentId === "" ? null : data.vatEstablishmentId,
    vatPeriodYear: data.vatPeriodYear,
    vatPeriodMonth: data.vatPeriodMonth,
    vatPeriodOverrideReason: data.vatPeriodOverrideReason,
    vatPeriodOverriddenByUserId:
      data.vatPeriodYear || data.vatPeriodMonth ? actorId ?? null : undefined,
    vatPeriodOverriddenAt:
      data.vatPeriodYear || data.vatPeriodMonth ? new Date() : undefined,
    updatedAt: new Date(),
  };

  const updated = await db
    .update(documents)
    .set(patch)
    .where(
      and(
        eq(documents.orgId, orgId),
        inArray(documents.id, documentIds),
        isNull(documents.deletedAt)
      )
    )
    .returning({ id: documents.id });

  for (const row of updated) {
    await auditMutation({
      orgId,
      entityType: "document",
      entityId: row.id,
      action: "update",
      actorId,
      newValue: { operation: "bulk_update_document_vat", ...data },
    });
  }

  return { count: updated.length };
}
