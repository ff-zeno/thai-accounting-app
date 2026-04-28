import { and, eq, sql } from "drizzle-orm";
import { db } from "../index";
import { payments, documents, documentLineItems, vendors } from "../schema";
import { orgScope } from "../helpers/org-scope";
import {
  createWhtCertificateDraft,
  getCertificatesByDocument,
  getFormTypeForEntity,
} from "./wht-certificates";

// ---------------------------------------------------------------------------
// Create payment
// ---------------------------------------------------------------------------

export async function createPayment(data: {
  orgId: string;
  documentId: string;
  paymentDate: string;
  grossAmount: string;
  whtAmountWithheld: string;
  netAmountPaid: string;
  paymentMethod?: "bank_transfer" | "promptpay" | "cheque" | "cash";
}): Promise<{ paymentId: string }> {
  const [payment] = await db
    .insert(payments)
    .values({
      orgId: data.orgId,
      documentId: data.documentId,
      paymentDate: data.paymentDate,
      grossAmount: data.grossAmount,
      whtAmountWithheld: data.whtAmountWithheld,
      netAmountPaid: data.netAmountPaid,
      paymentMethod: data.paymentMethod ?? "bank_transfer",
    })
    .returning({ id: payments.id });

  const whtResult = await createWhtDraftForPaymentEvent({
    ...data,
    paymentId: payment.id,
  });
  if (whtResult && whtResult.totalWht !== data.whtAmountWithheld) {
    const totalWht = parseFloat(whtResult.totalWht);
    const gross = parseFloat(data.grossAmount);
    await db
      .update(payments)
      .set({
        whtAmountWithheld: whtResult.totalWht,
        netAmountPaid: (gross - totalWht).toFixed(2),
      })
      .where(and(eq(payments.id, payment.id), eq(payments.orgId, data.orgId)));
  }

  return { paymentId: payment.id };
}

async function createWhtDraftForPaymentEvent(data: {
  orgId: string;
  documentId: string;
  paymentDate: string;
  paymentId: string;
}) {
  const existingCerts = await getCertificatesByDocument(data.orgId, data.documentId);
  if (existingCerts.length > 0) return;

  const [doc] = await db
    .select({
      id: documents.id,
      vendorId: documents.vendorId,
      vendorEntityType: vendors.entityType,
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

  if (!doc?.vendorId || !doc.vendorEntityType) return;

  const whtLineItems = await db
    .select()
    .from(documentLineItems)
    .where(
      and(
        eq(documentLineItems.orgId, data.orgId),
        eq(documentLineItems.documentId, data.documentId),
        sql`COALESCE(${documentLineItems.whtRate}, 0) > 0`,
        sql`${documentLineItems.deletedAt} IS NULL`
      )
    );

  if (whtLineItems.length === 0) return null;

  return createWhtCertificateDraft({
    orgId: data.orgId,
    vendorId: doc.vendorId,
    formType: getFormTypeForEntity(doc.vendorEntityType),
    paymentDate: data.paymentDate,
    paymentId: data.paymentId,
    applyAnnualThreshold: true,
    lineItems: whtLineItems.map((li) => ({
      documentId: data.documentId,
      lineItemId: li.id,
      baseAmount: li.amount ?? "0.00",
      whtRate: li.whtRate ?? "0.00",
      whtAmount: li.whtAmount ?? "0.00",
      rdPaymentTypeCode: li.rdPaymentTypeCode ?? undefined,
      whtType: li.whtType ?? undefined,
    })),
  });
}

// ---------------------------------------------------------------------------
// Query payments
// ---------------------------------------------------------------------------

export async function getPaymentsByDocument(orgId: string, documentId: string) {
  return db
    .select()
    .from(payments)
    .where(
      and(
        ...orgScope(payments, orgId),
        eq(payments.documentId, documentId)
      )
    )
    .orderBy(sql`${payments.createdAt} DESC`);
}

// ---------------------------------------------------------------------------
// Payment summary (computed, not stored)
// ---------------------------------------------------------------------------

/**
 * Compute amount_paid and balance_due for a document from the payments table.
 * These are always derived at query time, never denormalized.
 */
export async function getDocumentPaymentSummary(
  orgId: string,
  documentId: string
): Promise<{
  totalPaid: string;
  balanceDue: string;
  paymentCount: number;
}> {
  // Get total of all payments for this document
  const paymentResult = await db
    .select({
      totalPaid: sql<string>`COALESCE(SUM(${payments.netAmountPaid}), 0)::numeric(14,2)::text`,
      paymentCount: sql<number>`COUNT(*)::int`,
    })
    .from(payments)
    .where(
      and(
        ...orgScope(payments, orgId),
        eq(payments.documentId, documentId)
      )
    );

  // Get document total amount
  const docResult = await db
    .select({ totalAmount: documents.totalAmount })
    .from(documents)
    .where(
      and(
        ...orgScope(documents, orgId),
        eq(documents.id, documentId)
      )
    )
    .limit(1);

  const totalPaid = paymentResult[0]?.totalPaid ?? "0.00";
  const paymentCount = paymentResult[0]?.paymentCount ?? 0;
  const totalAmount = docResult[0]?.totalAmount ?? "0.00";

  // Use integer arithmetic to avoid floating-point precision issues
  const totalAmountCents = Math.round(parseFloat(totalAmount ?? "0") * 100);
  const totalPaidCents = Math.round(parseFloat(totalPaid) * 100);
  const balanceDue = ((totalAmountCents - totalPaidCents) / 100).toFixed(2);

  return { totalPaid, balanceDue, paymentCount };
}
