"use server";

import { revalidatePath } from "next/cache";
import { getVerifiedOrgId } from "@/lib/utils/org-context";
import { getCurrentUserId } from "@/lib/utils/auth";
import {
  searchDocuments,
  getDocumentForSidebar,
  getFilterOptions,
  updateDocumentFromExtraction,
  confirmDocument,
  getPendingPipelineCount,
  bulkSoftDeleteDocuments,
  type DocumentSearchFilters,
} from "@/lib/db/queries/documents";
import { createVendor, getVendorsByOrg } from "@/lib/db/queries/vendors";

interface SearchFilters {
  search?: string;
  categories?: string[];
  vendorIds?: string[];
  statuses?: ("draft" | "confirmed" | "partially_paid" | "paid" | "voided")[];
  dateFrom?: string;
  dateTo?: string;
  sortBy?: "issueDate" | "totalAmount";
  sortDir?: "asc" | "desc";
}

interface CursorInput {
  issueDate: string | null;
  id: string;
}

export async function searchDocumentsAction(
  direction: "expense" | "income",
  filters: SearchFilters,
  cursor?: CursorInput
) {
  const orgId = await getVerifiedOrgId();
  if (!orgId) return { data: [], hasMore: false, nextCursor: null };

  const queryFilters: DocumentSearchFilters = {
    orgId,
    direction,
    ...filters,
  };

  return searchDocuments(queryFilters, cursor ?? undefined);
}

export async function getDocumentDetailsAction(docId: string) {
  const orgId = await getVerifiedOrgId();
  if (!orgId) return null;

  return getDocumentForSidebar(orgId, docId);
}

export async function getFilterOptionsAction(direction: "expense" | "income") {
  const orgId = await getVerifiedOrgId();
  if (!orgId) return { categories: [], vendors: [] };

  return getFilterOptions(orgId, direction);
}

export async function updateDocumentSidebarAction(
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
    vendorId?: string | null;
    vendorName?: string | null;
  }
) {
  const orgId = await getVerifiedOrgId();
  if (!orgId) return { error: "No organization selected" };

  let resolvedVendorId = data.vendorId;

  // Auto-vendor creation: if vendorName is provided without vendorId
  if (data.vendorName && !data.vendorId) {
    // Search for existing vendor by exact name match
    const existing = await getVendorsByOrg(orgId, undefined, 1000, 0);
    const match = existing.find(
      (v) =>
        v.name.toLowerCase() === data.vendorName!.toLowerCase() ||
        v.nameTh === data.vendorName
    );

    if (match) {
      resolvedVendorId = match.id;
    } else {
      const newVendor = await createVendor({
        orgId,
        name: data.vendorName,
        entityType: "company",
      });
      resolvedVendorId = newVendor.id;
    }
  }

  await updateDocumentFromExtraction(orgId, docId, {
    type: data.type,
    documentNumber: data.documentNumber,
    issueDate: data.issueDate,
    dueDate: data.dueDate,
    subtotal: data.subtotal,
    vatAmount: data.vatAmount,
    totalAmount: data.totalAmount,
    currency: data.currency,
    category: data.category,
    vendorId: resolvedVendorId,
  });

  revalidatePath("/documents");
  return { success: true };
}

export async function confirmDocumentSidebarAction(docId: string) {
  const orgId = await getVerifiedOrgId();
  if (!orgId) return { error: "No organization selected" };

  await confirmDocument(orgId, docId);
  revalidatePath("/documents");
  return { success: true };
}

export async function bulkDeleteDocumentsAction(
  documentIds: string[]
): Promise<{ success: true; count: number } | { error: string }> {
  const orgId = await getVerifiedOrgId();
  if (!orgId) return { error: "No organization selected" };
  const actorId = (await getCurrentUserId()) ?? undefined;

  if (documentIds.length === 0) {
    return { error: "No documents selected" };
  }

  const result = await bulkSoftDeleteDocuments(orgId, documentIds, actorId);

  revalidatePath("/documents");
  return { success: true, count: result.count };
}

/**
 * Returns count of documents with active pipeline processing.
 * Used by the document table for polling to detect when to refresh.
 */
export async function getPendingPipelineCountAction(
  direction: "expense" | "income"
): Promise<number> {
  const orgId = await getVerifiedOrgId();
  if (!orgId) return 0;
  return getPendingPipelineCount(orgId, direction);
}
