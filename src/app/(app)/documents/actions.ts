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
  DocumentConfirmationError,
  type DocumentSearchFilters,
} from "@/lib/db/queries/documents";
import {
  createVendor,
  getVendorById,
  getVendorsByOrg,
  updateVendor,
} from "@/lib/db/queries/vendors";
import {
  writeReviewExemplars,
  type UserReviewValues,
} from "@/lib/db/queries/review-exemplars";

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
    taxInvoiceSubtype?: "full_ti" | "abb" | "e_tax_invoice" | "not_a_ti" | null;
    isPp36Subject?: boolean | null;
    vendorId?: string | null;
    vendorName?: string | null;
    /** When true, also mark the doc status=confirmed (merges old Confirm button). */
    confirm?: boolean;
    /**
     * Caller's extraction quality verdict. true = AI got everything right,
     * false = needed fixes. Purely for telemetry today; the corrections diff
     * already feeds the learning loop.
     */
    extractionAccepted?: boolean;
  }
) {
  const orgId = await getVerifiedOrgId();
  if (!orgId) return { error: "No organization selected" };

  let resolvedVendorId = data.vendorId ?? null;

  if (data.vendorName && !resolvedVendorId) {
    // No existing vendor linked — find-or-create by name
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
  } else if (data.vendorName && resolvedVendorId) {
    // Vendor already linked — rename in place if the user changed the display name.
    const current = await getVendorById(orgId, resolvedVendorId);
    const displayName = current?.displayAlias ?? current?.name ?? "";
    if (displayName.trim() !== data.vendorName.trim()) {
      // Update displayAlias so the legal DBD-sourced `name` stays authoritative
      // while the user's preferred label wins in the UI.
      await updateVendor(orgId, resolvedVendorId, {
        displayAlias: data.vendorName,
      });
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
    taxInvoiceSubtype: data.taxInvoiceSubtype,
    isPp36Subject: data.isPp36Subject,
    vendorId: resolvedVendorId,
  });

  if (data.confirm) {
    try {
      await confirmDocument(orgId, docId);
    } catch (error) {
      if (error instanceof DocumentConfirmationError) {
        return { error: error.message };
      }
      throw error;
    }
  }

  // Feed the learning loop with the same diff payload the full review page uses.
  try {
    const userValues: UserReviewValues = {};
    if ("type" in data) userValues.documentType = data.type ?? null;
    if ("documentNumber" in data)
      userValues.documentNumber = data.documentNumber ?? null;
    if ("issueDate" in data) userValues.issueDate = data.issueDate ?? null;
    if ("dueDate" in data) userValues.dueDate = data.dueDate ?? null;
    if ("subtotal" in data) userValues.subtotal = data.subtotal ?? null;
    if ("vatAmount" in data) userValues.vatAmount = data.vatAmount ?? null;
    if ("totalAmount" in data)
      userValues.totalAmount = data.totalAmount ?? null;
    if ("currency" in data) userValues.currency = data.currency ?? null;
    if ("vendorName" in data && data.vendorName != null) {
      userValues.vendorName = data.vendorName;
    }
    await writeReviewExemplars({ orgId, docId, userValues });
  } catch (error) {
    console.error(
      "[updateDocumentSidebarAction] exemplar write failed:",
      error
    );
  }

  revalidatePath("/documents");
  return { success: true };
}

export async function confirmDocumentSidebarAction(docId: string) {
  const orgId = await getVerifiedOrgId();
  if (!orgId) return { error: "No organization selected" };

  try {
    await confirmDocument(orgId, docId);
  } catch (error) {
    if (error instanceof DocumentConfirmationError) {
      return { error: error.message };
    }
    throw error;
  }
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
