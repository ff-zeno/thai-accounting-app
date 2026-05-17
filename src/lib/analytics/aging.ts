import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db/index";
import { documents, payments, vendors } from "@/lib/db/schema";

export type AgingKind = "ar" | "ap";

export interface AgingRow {
  counterpartyId: string | null;
  counterpartyName: string;
  current: string;
  days1To30: string;
  days31To60: string;
  days61To90: string;
  days91Plus: string;
  total: string;
}

function directionForKind(kind: AgingKind) {
  return kind === "ar" ? "income" : "expense";
}

export async function buildAgingSnapshot(
  orgId: string,
  asOfDate: string,
  kind: AgingKind
): Promise<AgingRow[]> {
  const ageDays = sql<number>`(${asOfDate}::date - COALESCE(${documents.dueDate}, ${documents.issueDate}, ${asOfDate}::date))`;
  const paidByDocument = db
    .select({
      documentId: payments.documentId,
      paidAmount: sql<string>`COALESCE(SUM(${payments.grossAmount}), 0)::numeric(14,2)`.as(
        "paid_amount"
      ),
    })
    .from(payments)
    .where(
      and(
        eq(payments.orgId, orgId),
        isNull(payments.deletedAt),
        sql`${payments.paymentDate} <= ${asOfDate}::date`
      )
    )
    .groupBy(payments.documentId)
    .as("paid_by_document");
  const amount = sql`GREATEST(COALESCE(${documents.totalAmountThb}, ${documents.totalAmount}, 0) - COALESCE(${paidByDocument.paidAmount}, 0), 0)`;

  return db
    .select({
      counterpartyId: vendors.id,
      counterpartyName: sql<string>`COALESCE(${vendors.name}, ${vendors.nameTh}, 'Unassigned')`,
      current: sql<string>`COALESCE(SUM(CASE WHEN ${ageDays} <= 0 THEN ${amount} ELSE 0 END), 0)::numeric(14,2)`,
      days1To30: sql<string>`COALESCE(SUM(CASE WHEN ${ageDays} BETWEEN 1 AND 30 THEN ${amount} ELSE 0 END), 0)::numeric(14,2)`,
      days31To60: sql<string>`COALESCE(SUM(CASE WHEN ${ageDays} BETWEEN 31 AND 60 THEN ${amount} ELSE 0 END), 0)::numeric(14,2)`,
      days61To90: sql<string>`COALESCE(SUM(CASE WHEN ${ageDays} BETWEEN 61 AND 90 THEN ${amount} ELSE 0 END), 0)::numeric(14,2)`,
      days91Plus: sql<string>`COALESCE(SUM(CASE WHEN ${ageDays} >= 91 THEN ${amount} ELSE 0 END), 0)::numeric(14,2)`,
      total: sql<string>`COALESCE(SUM(${amount}), 0)::numeric(14,2)`,
    })
    .from(documents)
    .leftJoin(vendors, eq(vendors.id, documents.vendorId))
    .leftJoin(paidByDocument, eq(paidByDocument.documentId, documents.id))
    .where(
      and(
        eq(documents.orgId, orgId),
        isNull(documents.deletedAt),
        eq(documents.direction, directionForKind(kind)),
        inArray(documents.status, ["confirmed", "partially_paid"]),
        sql`COALESCE(${documents.totalAmountThb}, ${documents.totalAmount}, 0) > 0`,
        sql`${amount} > 0`,
        sql`COALESCE(${documents.issueDate}, ${asOfDate}::date) <= ${asOfDate}::date`
      )
    )
    .groupBy(vendors.id, vendors.name, vendors.nameTh)
    .orderBy(sql`COALESCE(SUM(${amount}), 0) DESC`);
}

export function summarizeAging(rows: AgingRow[]) {
  return rows.reduce(
    (summary, row) => {
      summary.current += Number(row.current);
      summary.days1To30 += Number(row.days1To30);
      summary.days31To60 += Number(row.days31To60);
      summary.days61To90 += Number(row.days61To90);
      summary.days91Plus += Number(row.days91Plus);
      summary.total += Number(row.total);
      return summary;
    },
    {
      current: 0,
      days1To30: 0,
      days31To60: 0,
      days61To90: 0,
      days91Plus: 0,
      total: 0,
    }
  );
}
