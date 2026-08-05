import { and, desc, eq, isNull, sum } from "drizzle-orm";
import { db, type DbConnection } from "../index";
import { documentLineItems, documents, vendors, whtCreditsReceived } from "../schema";
import { orgScope } from "../helpers/org-scope";
import { auditMutation } from "../helpers/audit-log";

export interface CreateWhtCreditReceivedInput {
  orgId: string;
  customerVendorId: string;
  certificateReceivedDocumentId?: string | null;
  paymentDate: string;
  grossAmount: string;
  whtAmount: string;
  formType: string;
  taxYear?: number;
  certificateNo?: string | null;
  notes?: string | null;
  tx?: DbConnection;
}

function taxYearFromDate(paymentDate: string): number {
  const year = Number(paymentDate.slice(0, 4));
  if (!Number.isInteger(year)) {
    throw new Error("Payment date must be a valid Bangkok civil date");
  }
  return year;
}

function parseMoneyCents(value: string, label: string): number {
  if (!/^\d+(\.\d{1,2})?$/.test(value)) {
    throw new Error(`${label} must be a non-negative amount with at most 2 decimals`);
  }
  const [whole, fraction = ""] = value.split(".");
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
}

function formatCents(cents: number): string {
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, "0")}`;
}

export async function createWhtCreditReceived(
  input: CreateWhtCreditReceivedInput
): Promise<string> {
  if (!input.tx) {
    return db.transaction((tx) =>
      createWhtCreditReceived({ ...input, tx: tx as DbConnection })
    );
  }
  const conn = input.tx ?? db;
  const grossAmountCents = parseMoneyCents(input.grossAmount, "Gross amount");
  const whtAmountCents = parseMoneyCents(input.whtAmount, "WHT amount");
  if (whtAmountCents > grossAmountCents) {
    throw new Error("WHT amount cannot exceed gross amount");
  }

  const [customer] = await conn
    .select({ id: vendors.id })
    .from(vendors)
    .where(
      and(
        ...orgScope(vendors, input.orgId),
        eq(vendors.id, input.customerVendorId)
      )
    )
    .limit(1);
  if (!customer) throw new Error("Customer vendor not found");

  if (input.certificateReceivedDocumentId) {
    const [document] = await conn
      .select({ id: documents.id })
      .from(documents)
      .where(
        and(
          ...orgScope(documents, input.orgId),
          eq(documents.id, input.certificateReceivedDocumentId)
        )
      )
      .limit(1);
    if (!document) throw new Error("Certificate document not found");
  }

  const taxYear = input.taxYear ?? taxYearFromDate(input.paymentDate);
  const [created] = await conn
    .insert(whtCreditsReceived)
    .values({
      orgId: input.orgId,
      customerVendorId: input.customerVendorId,
      certificateReceivedDocumentId: input.certificateReceivedDocumentId ?? null,
      paymentDate: input.paymentDate,
      grossAmount: formatCents(grossAmountCents),
      whtAmount: formatCents(whtAmountCents),
      formType: input.formType,
      taxYear,
      certificateNo: input.certificateNo?.trim() || null,
      notes: input.notes?.trim() || null,
    })
    .returning({ id: whtCreditsReceived.id });

  await auditMutation(
    {
      orgId: input.orgId,
      entityType: "wht_credit_received",
      entityId: created.id,
      action: "create",
      newValue: {
        customerVendorId: input.customerVendorId,
        taxYear,
        grossAmount: input.grossAmount,
        whtAmount: input.whtAmount,
        formType: input.formType,
        certificateNo: input.certificateNo ?? null,
      },
    },
    conn
  );
  // Used to enqueue a posting_outbox row so the general ledger recorded this
  // credit as a journal entry. The ledger went with the accounting surface
  // (docs/deferred-features.md); restore the enqueue if it comes back.

  return created.id;
}

export async function materializeWhtCreditReceivedFromDocument(
  orgId: string,
  documentId: string,
  tx?: DbConnection
): Promise<string | null> {
  const conn = tx ?? db;
  const [doc] = await conn
    .select({
      id: documents.id,
      vendorId: documents.vendorId,
      type: documents.type,
      direction: documents.direction,
      status: documents.status,
      issueDate: documents.issueDate,
      documentNumber: documents.documentNumber,
      totalAmount: documents.totalAmount,
    })
    .from(documents)
    .where(and(...orgScope(documents, orgId), eq(documents.id, documentId)))
    .limit(1);

  if (
    !doc ||
    doc.type !== "wht_certificate_received" ||
    doc.direction !== "income" ||
    doc.status !== "confirmed"
  ) {
    return null;
  }
  if (!doc.vendorId) throw new Error("Incoming WHT certificate requires customer");
  if (!doc.issueDate) throw new Error("Incoming WHT certificate requires payment date");
  if (!doc.totalAmount || Number(doc.totalAmount) <= 0) {
    throw new Error("Incoming WHT certificate requires gross amount > 0");
  }

  const [existing] = await conn
    .select({ id: whtCreditsReceived.id })
    .from(whtCreditsReceived)
    .where(
      and(
        ...orgScope(whtCreditsReceived, orgId),
        eq(whtCreditsReceived.certificateReceivedDocumentId, documentId)
      )
    )
    .limit(1);
  if (existing) return existing.id;

  const [withheld] = await conn
    .select({ whtAmount: sum(documentLineItems.whtAmount) })
    .from(documentLineItems)
    .where(
      and(...orgScope(documentLineItems, orgId), eq(documentLineItems.documentId, documentId))
    );
  const whtAmount = withheld?.whtAmount
    ? formatCents(parseMoneyCents(String(withheld.whtAmount), "WHT amount"))
    : "0.00";
  if (Number(whtAmount) <= 0) {
    throw new Error("Incoming WHT certificate requires withheld amount");
  }

  return createWhtCreditReceived({
    orgId,
    customerVendorId: doc.vendorId,
    certificateReceivedDocumentId: documentId,
    paymentDate: doc.issueDate,
    grossAmount: doc.totalAmount,
    whtAmount,
    formType: "50_tawi",
    certificateNo: doc.documentNumber,
    notes: "Materialized from confirmed incoming 50 Tawi document",
    tx: conn,
  });
}

export async function getWhtCreditsReceived(orgId: string, taxYear?: number) {
  const conditions = [...orgScope(whtCreditsReceived, orgId)];
  if (taxYear !== undefined) {
    conditions.push(eq(whtCreditsReceived.taxYear, taxYear));
  }

  return db
    .select({
      id: whtCreditsReceived.id,
      customerVendorId: whtCreditsReceived.customerVendorId,
      customerName: vendors.name,
      customerNameTh: vendors.nameTh,
      certificateReceivedDocumentId:
        whtCreditsReceived.certificateReceivedDocumentId,
      paymentDate: whtCreditsReceived.paymentDate,
      grossAmount: whtCreditsReceived.grossAmount,
      whtAmount: whtCreditsReceived.whtAmount,
      formType: whtCreditsReceived.formType,
      taxYear: whtCreditsReceived.taxYear,
      certificateNo: whtCreditsReceived.certificateNo,
      notes: whtCreditsReceived.notes,
      createdAt: whtCreditsReceived.createdAt,
    })
    .from(whtCreditsReceived)
    .innerJoin(
      vendors,
      and(
        eq(whtCreditsReceived.customerVendorId, vendors.id),
        eq(whtCreditsReceived.orgId, vendors.orgId),
        isNull(vendors.deletedAt)
      )
    )
    .where(and(...conditions))
    .orderBy(desc(whtCreditsReceived.paymentDate), desc(whtCreditsReceived.createdAt));
}

export async function getWhtCreditsReceivedTotal(
  orgId: string,
  taxYear: number
): Promise<string> {
  const [row] = await db
    .select({
      total: sum(whtCreditsReceived.whtAmount),
    })
    .from(whtCreditsReceived)
    .where(
      and(
        ...orgScope(whtCreditsReceived, orgId),
        eq(whtCreditsReceived.taxYear, taxYear)
      )
    );

  return row?.total ? Number(row.total).toFixed(2) : "0.00";
}
