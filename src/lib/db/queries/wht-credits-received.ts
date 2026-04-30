import { and, desc, eq, isNull, sum } from "drizzle-orm";
import { db } from "../index";
import { documents, vendors, whtCreditsReceived } from "../schema";
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
}

function taxYearFromDate(paymentDate: string): number {
  const year = Number(paymentDate.slice(0, 4));
  if (!Number.isInteger(year)) {
    throw new Error("Payment date must be a valid Bangkok civil date");
  }
  return year;
}

function parseMoney(value: string, label: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${label} must be a non-negative amount`);
  }
  return parsed;
}

export async function createWhtCreditReceived(
  input: CreateWhtCreditReceivedInput
): Promise<string> {
  const grossAmount = parseMoney(input.grossAmount, "Gross amount");
  const whtAmount = parseMoney(input.whtAmount, "WHT amount");
  if (whtAmount > grossAmount) {
    throw new Error("WHT amount cannot exceed gross amount");
  }

  const [customer] = await db
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
    const [document] = await db
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
  const [created] = await db
    .insert(whtCreditsReceived)
    .values({
      orgId: input.orgId,
      customerVendorId: input.customerVendorId,
      certificateReceivedDocumentId: input.certificateReceivedDocumentId ?? null,
      paymentDate: input.paymentDate,
      grossAmount: grossAmount.toFixed(2),
      whtAmount: whtAmount.toFixed(2),
      formType: input.formType,
      taxYear,
      certificateNo: input.certificateNo?.trim() || null,
      notes: input.notes?.trim() || null,
    })
    .returning({ id: whtCreditsReceived.id });

  await auditMutation({
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
  });

  return created.id;
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
