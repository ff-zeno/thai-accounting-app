/**
 * Per-vendor category memory.
 *
 * Looks at prior non-deleted documents for the same org+vendor and returns
 * the dominant category when one exists with strong enough consensus.
 *
 * A future iteration can refine this by also matching line-item descriptions
 * — e.g. when two vendors issue multiple categories, use line items to pick.
 */

import { and, eq, isNull, ne, sql } from "drizzle-orm";
import { db } from "../index";
import { documents } from "../schema";

export interface SuggestedCategory {
  category: string;
  confidence: number; // 0..1 — share of prior docs that carried this category
  priorCount: number;
}

/**
 * Return the dominant category for prior docs from this vendor, if any.
 * Requires at least `minPrior` prior docs and ≥`minShare` agreement.
 *
 * Returns null when there's no strong consensus (e.g. vendor has 1 prior
 * doc, or categories are split). Excludes the current document.
 */
export async function suggestCategoryForVendor(
  orgId: string,
  vendorId: string,
  currentDocId: string,
  opts?: { minPrior?: number; minShare?: number }
): Promise<SuggestedCategory | null> {
  const minPrior = opts?.minPrior ?? 1;
  const minShare = opts?.minShare ?? 0.6;

  const rows = await db
    .select({
      category: documents.category,
      count: sql<number>`count(*)::int`,
    })
    .from(documents)
    .where(
      and(
        eq(documents.orgId, orgId),
        eq(documents.vendorId, vendorId),
        ne(documents.id, currentDocId),
        isNull(documents.deletedAt),
        sql`${documents.category} IS NOT NULL AND ${documents.category} <> ''`
      )
    )
    .groupBy(documents.category);

  if (rows.length === 0) return null;
  const total = rows.reduce((s, r) => s + r.count, 0);
  if (total < minPrior) return null;

  const top = rows.reduce((a, b) => (a.count >= b.count ? a : b));
  const share = top.count / total;
  if (share < minShare) return null;
  if (!top.category) return null;

  return { category: top.category, confidence: share, priorCount: total };
}
