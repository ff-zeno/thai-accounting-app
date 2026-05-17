import { and, eq, isNull, sql } from "drizzle-orm";
import type { DbConnection } from "../index";
import {
  documents,
  documentLineItems,
  payments,
  pp36Obligations,
  taxTreatmentDecisions,
  vendors,
} from "../schema";
import { orgScope } from "../helpers/org-scope";
import {
  classifyForeignVendorTax,
  normalizeIsoCountry,
} from "@/lib/tax/foreign-vendor-tax";
import { hashVatSnapshot, periodFromBangkokDate } from "./vat-operations-ledger";

const PP36_VAT_RATE = "0.0700";

export class ForeignVendorTaxMaterializationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ForeignVendorTaxMaterializationError";
  }
}

function money(value: string | null | undefined) {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatMoney(value: number) {
  return value.toFixed(2);
}

async function getConnection(tx?: DbConnection) {
  if (tx) return tx;
  const { db } = await import("../index");
  return db;
}

export async function materializePp36ObligationFromDocument(data: {
  orgId: string;
  documentId: string;
  actorId: string;
  tx?: DbConnection;
}) {
  const conn = await getConnection(data.tx);
  const [doc] = await conn
    .select({
      id: documents.id,
      orgId: documents.orgId,
      vendorId: documents.vendorId,
      direction: documents.direction,
      status: documents.status,
      type: documents.type,
      documentNumber: documents.documentNumber,
      issueDate: documents.issueDate,
      subtotal: documents.subtotal,
      totalAmount: documents.totalAmount,
      totalAmountThb: documents.totalAmountThb,
      exchangeRate: documents.exchangeRate,
      currency: documents.currency,
      category: documents.category,
      isPp36Subject: documents.isPp36Subject,
      vendorCountry: vendors.country,
      vendorEntityType: vendors.entityType,
      vendorName: vendors.name,
    })
    .from(documents)
    .innerJoin(
      vendors,
      and(eq(documents.vendorId, vendors.id), eq(documents.orgId, vendors.orgId))
    )
    .where(
      and(
        ...orgScope(documents, data.orgId),
        eq(documents.id, data.documentId)
      )
    )
    .limit(1);

  if (!doc) {
    throw new ForeignVendorTaxMaterializationError("Document not found");
  }
  if (doc.status !== "confirmed") {
    throw new ForeignVendorTaxMaterializationError(
      "PP36 obligation can only be materialized from a confirmed document"
    );
  }
  if (!doc.vendorId) {
    throw new ForeignVendorTaxMaterializationError("PP36 obligation requires vendor");
  }
  const vendorId = doc.vendorId;

  const [payment] = await conn
    .select({ paymentDate: payments.paymentDate, id: payments.id })
    .from(payments)
    .where(
      and(
        ...orgScope(payments, data.orgId),
        eq(payments.documentId, data.documentId)
      )
    )
    .orderBy(sql`${payments.paymentDate} DESC`, sql`${payments.createdAt} DESC`)
    .limit(1);

  const classification = classifyForeignVendorTax({
    direction: doc.direction,
    vendorCountry: doc.vendorCountry,
    vendorEntityType: doc.vendorEntityType,
    category: doc.category,
    isPp36Subject: doc.isPp36Subject,
    paymentDate: payment?.paymentDate,
    issueDate: doc.issueDate,
    subtotal: doc.subtotal,
    totalAmount: doc.totalAmount,
    totalAmountThb: doc.totalAmountThb,
    exchangeRate: doc.exchangeRate,
    currency: doc.currency,
  });

  if (!classification.pp36Required) return null;
  if (classification.blockingReasons.length > 0 || !classification.taxPointDate) {
    throw new ForeignVendorTaxMaterializationError(
      classification.blockingReasons.join("; ") || "PP36 tax point date is required"
    );
  }
  const vendorCountryCode = normalizeIsoCountry(doc.vendorCountry);
  if (!vendorCountryCode || vendorCountryCode === "TH") {
    throw new ForeignVendorTaxMaterializationError(
      "PP36 obligation requires reviewed non-TH vendor country"
    );
  }

  const currency = (doc.currency ?? "THB").toUpperCase().slice(0, 3);
  const sourceAmount = money(doc.totalAmount) ?? money(doc.subtotal);
  const subtotal = money(doc.subtotal);
  const explicitThb = money(doc.totalAmountThb);
  const fxRate = money(doc.exchangeRate);
  const baseAmountThb =
    explicitThb ??
    (currency === "THB" ? subtotal : null) ??
    (subtotal != null && fxRate != null ? subtotal * fxRate : null);

  if (baseAmountThb == null) {
    throw new ForeignVendorTaxMaterializationError(
      "PP36 foreign service requires reviewed THB base or exchange-rate snapshot"
    );
  }

  const lineItems = await conn
    .select({
      description: documentLineItems.description,
      amount: documentLineItems.amount,
    })
    .from(documentLineItems)
    .where(
      and(
        eq(documentLineItems.orgId, data.orgId),
        eq(documentLineItems.documentId, data.documentId),
        isNull(documentLineItems.deletedAt)
      )
    );

  const sourceSnapshot = {
    version: "pp36_document_v1",
    documentId: doc.id,
    documentNumber: doc.documentNumber,
    documentType: doc.type,
    issueDate: doc.issueDate,
    paymentDate: payment?.paymentDate ?? null,
    vendorId,
    vendorName: doc.vendorName,
    vendorCountryCode,
    category: doc.category,
    currency,
    subtotal: doc.subtotal,
    totalAmount: doc.totalAmount,
    totalAmountThb: doc.totalAmountThb,
    exchangeRate: doc.exchangeRate,
    lineItems,
  };

  const [existing] = await conn
    .select()
    .from(pp36Obligations)
    .where(
      and(
        eq(pp36Obligations.orgId, data.orgId),
        eq(pp36Obligations.sourceDocumentId, data.documentId),
        isNull(pp36Obligations.sourceDocumentLineId),
        isNull(pp36Obligations.deletedAt)
      )
    )
    .limit(1);

  const period = periodFromBangkokDate(classification.taxPointDate);
  const periodBasis: "payment_date" | "invoice_date" = payment?.paymentDate
    ? "payment_date"
    : "invoice_date";
  const obligationValues = {
    orgId: data.orgId,
    sourceDocumentId: data.documentId,
    vendorId,
    vendorCountryCode,
    serviceDescription:
      lineItems
        .map((line) => line.description)
        .filter(Boolean)
        .join("; ")
        .slice(0, 500) || doc.category || "Foreign service",
    baseAmountThb: formatMoney(baseAmountThb),
    sourceCurrency: currency,
    sourceAmount: sourceAmount != null ? formatMoney(sourceAmount) : null,
    fxRate: fxRate != null ? fxRate.toFixed(6) : null,
    fxRateSource: fxRate != null ? "reviewed_document" : null,
    fxRateDate: fxRate != null ? classification.taxPointDate : null,
    vatAmount: formatMoney(baseAmountThb * 0.07),
    vatRate: PP36_VAT_RATE,
    occurredOn: doc.issueDate ?? classification.taxPointDate,
    paymentDate: payment?.paymentDate ?? classification.taxPointDate,
    taxPointDate: classification.taxPointDate,
    periodBasis,
    periodRuleVersionId: null,
    pp36PeriodYear: period.year,
    pp36PeriodMonth: period.month,
    status: "pp36_required" as const,
    sourceSnapshot,
    sourceSnapshotHash: hashVatSnapshot(sourceSnapshot),
  };

  if (existing) {
    if (
      !["needs_review", "pp36_required"].includes(existing.status) &&
      existing.sourceSnapshotHash !== obligationValues.sourceSnapshotHash
    ) {
      throw new ForeignVendorTaxMaterializationError(
        "Existing PP36 obligation is already in filing lifecycle and cannot be rematerialized"
      );
    }
    const [updated] = await conn
      .update(pp36Obligations)
      .set(obligationValues)
      .where(
        and(eq(pp36Obligations.id, existing.id), eq(pp36Obligations.orgId, data.orgId))
      )
      .returning();
    return updated;
  }

  const [decision] = await conn
    .insert(taxTreatmentDecisions)
    .values({
      orgId: data.orgId,
      sourceDocumentId: data.documentId,
      treatmentType: "pp36_foreign_service",
      reviewStatus: "confirmed",
      evidence: {
        classification,
        sourceSnapshotHash: obligationValues.sourceSnapshotHash,
      },
      suggestedBy: "phase_9a_foreign_vendor_tax",
      confirmedByUserId: data.actorId,
      confirmedAt: new Date(),
    })
    .returning();

  const [obligation] = await conn
    .insert(pp36Obligations)
    .values({
      ...obligationValues,
      taxTreatmentDecisionId: decision.id,
    })
    .returning();
  return obligation;
}
