import { and, eq, isNull, desc, sql, or, like, lt, gte, lte, inArray, asc } from "drizzle-orm";
import { db } from "../index";
import {
  documents,
  documentFiles,
  documentLineItems,
  vendors,
  reconciliationMatches,
  transactions,
  bankAccounts,
} from "../schema";
import { auditMutation } from "../helpers/audit-log";

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
    .leftJoin(vendors, eq(documents.vendorId, vendors.id))
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

export async function getDocumentById(orgId: string, id: string) {
  const results = await db
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

export async function getDocumentWithDetails(orgId: string, id: string) {
  const doc = await getDocumentById(orgId, id);
  if (!doc) return null;

  const [files, lineItems, vendor] = await Promise.all([
    db
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
    db
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
      ? db
          .select()
          .from(vendors)
          .where(eq(vendors.id, doc.vendorId))
          .limit(1)
          .then((r) => r[0] ?? null)
      : Promise.resolve(null),
  ]);

  return { ...doc, files, lineItems, vendor };
}

export async function createDocument(data: {
  orgId: string;
  direction: "expense" | "income";
  type?: "invoice" | "receipt" | "debit_note" | "credit_note";
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
    type?: "invoice" | "receipt" | "debit_note" | "credit_note";
    documentNumber?: string | null;
    issueDate?: string | null;
    dueDate?: string | null;
    subtotal?: string | null;
    vatAmount?: string | null;
    totalAmount?: string | null;
    currency?: string | null;
    category?: string | null;
    detectedLanguage?: string | null;
    aiConfidence?: string | null;
    needsReview?: boolean;
    reviewNotes?: string | null;
  }
) {
  const [doc] = await db
    .update(documents)
    .set(data)
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

export async function confirmDocument(orgId: string, docId: string) {
  const [doc] = await db
    .update(documents)
    .set({ status: "confirmed", needsReview: false })
    .where(and(eq(documents.id, docId), eq(documents.orgId, orgId)))
    .returning();

  if (doc) {
    await auditMutation({
      orgId,
      entityType: "document",
      entityId: docId,
      action: "update",
      newValue: { status: "confirmed", needsReview: false },
    });
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
    .leftJoin(vendors, eq(documents.vendorId, vendors.id))
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
          .where(eq(vendors.id, doc.vendorId))
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
        eq(reconciliationMatches.transactionId, transactions.id)
      )
      .innerJoin(
        bankAccounts,
        eq(transactions.bankAccountId, bankAccounts.id)
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
    .innerJoin(documentFiles, eq(documentFiles.documentId, documents.id))
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
      .innerJoin(vendors, eq(documents.vendorId, vendors.id))
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
