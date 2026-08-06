import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "../index";
import {
  exceptionQueue,
  vendors,
  whtCertificates,
  whtCreditsReceived,
} from "../schema";
import { documentReviewRoute } from "@/lib/routes/documents";

export type TaxWorkflowException = {
  id: string;
  area: "system" | "wht_incoming" | "wht_outgoing";
  severity: string;
  summary: string;
  sourceHref: string;
  createdAt: Date | string | null;
};

function workflowExceptionHref(entityType: string, entityId: string) {
  if (entityType === "document") {
    return documentReviewRoute(entityId);
  }

  return "/tax/withholding";
}

export async function getTaxWorkflowExceptions(orgId: string) {
  const unresolved = await db
    .select({
      id: exceptionQueue.id,
      severity: exceptionQueue.severity,
      summary: exceptionQueue.summary,
      entityType: exceptionQueue.entityType,
      entityId: exceptionQueue.entityId,
      createdAt: exceptionQueue.createdAt,
    })
    .from(exceptionQueue)
    .where(and(eq(exceptionQueue.orgId, orgId), isNull(exceptionQueue.resolvedAt)))
    .orderBy(desc(exceptionQueue.createdAt))
    .limit(20);

  const incomingMissingEvidence = await db
    .select({
      id: whtCreditsReceived.id,
      paymentDate: whtCreditsReceived.paymentDate,
      whtAmount: whtCreditsReceived.whtAmount,
      customerName: sql<string>`COALESCE(${vendors.name}, ${vendors.nameTh}, 'Unassigned')`,
    })
    .from(whtCreditsReceived)
    .leftJoin(
      vendors,
      and(
        eq(vendors.id, whtCreditsReceived.customerVendorId),
        eq(vendors.orgId, whtCreditsReceived.orgId),
        isNull(vendors.deletedAt)
      )
    )
    .where(
      and(
        eq(whtCreditsReceived.orgId, orgId),
        isNull(whtCreditsReceived.deletedAt),
        isNull(whtCreditsReceived.certificateReceivedDocumentId)
      )
    )
    .orderBy(desc(whtCreditsReceived.paymentDate), desc(whtCreditsReceived.createdAt))
    .limit(20);

  const outgoingUnfiled = await db
    .select({
      id: whtCertificates.id,
      paymentDate: whtCertificates.paymentDate,
      formType: whtCertificates.formType,
      totalWht: whtCertificates.totalWht,
      payeeName: sql<string>`COALESCE(${vendors.name}, ${vendors.nameTh}, 'Unassigned')`,
    })
    .from(whtCertificates)
    .leftJoin(
      vendors,
      and(
        eq(vendors.id, whtCertificates.payeeVendorId),
        eq(vendors.orgId, whtCertificates.orgId),
        isNull(vendors.deletedAt)
      )
    )
    .where(
      and(
        eq(whtCertificates.orgId, orgId),
        isNull(whtCertificates.deletedAt),
        isNull(whtCertificates.filingId),
        sql`${whtCertificates.status} NOT IN ('voided', 'replaced')`
      )
    )
    .orderBy(desc(whtCertificates.paymentDate), desc(whtCertificates.createdAt))
    .limit(20);

  const rows: TaxWorkflowException[] = [
    ...unresolved.map((row) => ({
      id: row.id,
      area: "system" as const,
      severity: row.severity,
      summary: row.summary,
      sourceHref: workflowExceptionHref(row.entityType, row.entityId),
      createdAt: row.createdAt,
    })),
    ...incomingMissingEvidence.map((row) => ({
      id: row.id,
      area: "wht_incoming" as const,
      severity: "warning",
      summary: `Missing incoming WHT certificate evidence from ${row.customerName} for ${row.whtAmount}`,
      sourceHref: "/tax/withholding/incoming",
      createdAt: row.paymentDate,
    })),
    ...outgoingUnfiled.map((row) => ({
      id: row.id,
      area: "wht_outgoing" as const,
      severity: "warning",
      summary: `${row.formType.toUpperCase()} certificate for ${row.payeeName} is not linked to a filing`,
      sourceHref: "/tax/withholding/filings",
      createdAt: row.paymentDate,
    })),
  ];

  return rows.sort((a, b) => String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? "")));
}
