import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "../index";
import {
  vendors,
  whtCertificateItems,
  whtCertificates,
  whtCreditsReceived,
  whtMonthlyFilings,
} from "../schema";
import { orgScope } from "../helpers/org-scope";

export type WhtRegisterDirection = "incoming" | "outgoing";

export interface WhtRegisterFilters {
  direction?: WhtRegisterDirection;
  taxYear?: number;
  periodMonth?: number;
}

export async function getWhtRegisterRows(
  orgId: string,
  filters: WhtRegisterFilters = {}
) {
  const rows = [];

  if (!filters.direction || filters.direction === "incoming") {
    const conditions = [...orgScope(whtCreditsReceived, orgId)];
    if (filters.taxYear) conditions.push(eq(whtCreditsReceived.taxYear, filters.taxYear));
    if (filters.periodMonth) {
      conditions.push(
        sql`EXTRACT(MONTH FROM ${whtCreditsReceived.paymentDate}::date) = ${filters.periodMonth}`
      );
    }

    const incoming = await db
      .select({
        id: whtCreditsReceived.id,
        paymentDate: whtCreditsReceived.paymentDate,
        counterpartyName: sql<string>`COALESCE(${vendors.name}, ${vendors.nameTh}, 'Unassigned')`,
        grossAmount: whtCreditsReceived.grossAmount,
        whtAmount: whtCreditsReceived.whtAmount,
        formType: whtCreditsReceived.formType,
        taxYear: whtCreditsReceived.taxYear,
        certificateStatus: sql<string>`CASE WHEN ${whtCreditsReceived.certificateReceivedDocumentId} IS NULL THEN 'missing_evidence' ELSE 'received' END`,
        filingStatus: sql<string>`'cit_credit_pool'`,
        sourceDocumentId: whtCreditsReceived.certificateReceivedDocumentId,
        sourceCertificateId: sql<string | null>`NULL`,
      })
      .from(whtCreditsReceived)
      .leftJoin(
        vendors,
        and(
          eq(whtCreditsReceived.customerVendorId, vendors.id),
          eq(whtCreditsReceived.orgId, vendors.orgId),
          isNull(vendors.deletedAt)
        )
      )
      .where(and(...conditions))
      .orderBy(desc(whtCreditsReceived.paymentDate), desc(whtCreditsReceived.createdAt));

    rows.push(
      ...incoming.map((row) => ({
        ...row,
        direction: "incoming" as const,
        whtRate:
          Number(row.grossAmount) === 0
            ? "0.0000"
            : (Number(row.whtAmount) / Number(row.grossAmount)).toFixed(4),
        filingPeriod: String(row.taxYear),
      }))
    );
  }

  if (!filters.direction || filters.direction === "outgoing") {
    const conditions = [...orgScope(whtCertificates, orgId)];
    if (filters.taxYear) {
      conditions.push(
        sql`EXTRACT(YEAR FROM ${whtCertificates.paymentDate}::date) = ${filters.taxYear}`
      );
    }
    if (filters.periodMonth) {
      conditions.push(
        sql`EXTRACT(MONTH FROM ${whtCertificates.paymentDate}::date) = ${filters.periodMonth}`
      );
    }

    const outgoing = await db
      .select({
        id: whtCertificates.id,
        paymentDate: whtCertificates.paymentDate,
        counterpartyName: sql<string>`COALESCE(${vendors.name}, ${vendors.nameTh}, 'Unassigned')`,
        grossAmount: whtCertificates.totalBaseAmount,
        whtAmount: whtCertificates.totalWht,
        formType: whtCertificates.formType,
        certificateStatus: whtCertificates.status,
        filingStatus: sql<string>`COALESCE(${whtMonthlyFilings.status}::text, 'unfiled')`,
        filingPeriod: sql<string>`CASE
          WHEN ${whtCertificates.paymentDate} IS NULL THEN NULL
          ELSE CONCAT(EXTRACT(YEAR FROM ${whtCertificates.paymentDate}::date)::int, '-', LPAD(EXTRACT(MONTH FROM ${whtCertificates.paymentDate}::date)::int::text, 2, '0'))
        END`,
        sourceDocumentId: sql<string | null>`MIN(${whtCertificateItems.documentId}::text)`,
        sourceCertificateId: whtCertificates.id,
      })
      .from(whtCertificates)
      .leftJoin(
        vendors,
        and(
          eq(whtCertificates.payeeVendorId, vendors.id),
          eq(whtCertificates.orgId, vendors.orgId),
          isNull(vendors.deletedAt)
        )
      )
      .leftJoin(
        whtCertificateItems,
        and(
          eq(whtCertificateItems.certificateId, whtCertificates.id),
          eq(whtCertificateItems.orgId, whtCertificates.orgId),
          isNull(whtCertificateItems.deletedAt)
        )
      )
      .leftJoin(
        whtMonthlyFilings,
        and(
          eq(whtMonthlyFilings.id, whtCertificates.filingId),
          eq(whtMonthlyFilings.orgId, whtCertificates.orgId),
          isNull(whtMonthlyFilings.deletedAt)
        )
      )
      .where(and(...conditions, isNull(whtCertificates.deletedAt)))
      .groupBy(
        whtCertificates.id,
        vendors.name,
        vendors.nameTh,
        whtMonthlyFilings.status
      )
      .orderBy(desc(whtCertificates.paymentDate), desc(whtCertificates.createdAt));

    rows.push(
      ...outgoing.map((row) => ({
        ...row,
        direction: "outgoing" as const,
        taxYear: row.paymentDate ? Number(row.paymentDate.slice(0, 4)) : null,
        whtRate:
          Number(row.grossAmount ?? 0) === 0
            ? "0.0000"
            : (Number(row.whtAmount ?? 0) / Number(row.grossAmount)).toFixed(4),
      }))
    );
  }

  return rows.sort((a, b) => String(b.paymentDate ?? "").localeCompare(String(a.paymentDate ?? "")));
}
