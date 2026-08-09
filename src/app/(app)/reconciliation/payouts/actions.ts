"use server";

import { revalidatePath } from "next/cache";

import { getVerifiedOrgId } from "@/lib/utils/org-context";
import {
  confirmSettlementMatch,
  unlinkSettlement,
} from "@/lib/db/queries/processor-settlements";

export interface PayoutActionResult {
  success: boolean;
  error?: string;
}

function revalidate() {
  revalidatePath("/reconciliation/payouts");
  revalidatePath("/income/settlements");
}

/** Accept the matcher's suggestion. */
export async function confirmPayoutMatchAction(
  settlementId: string
): Promise<PayoutActionResult> {
  const orgId = await getVerifiedOrgId();
  if (!orgId) return { success: false, error: "No organization selected" };

  const confirmed = await confirmSettlementMatch(orgId, settlementId);
  if (!confirmed) {
    return { success: false, error: "This payout is no longer awaiting review" };
  }

  revalidate();
  return { success: true };
}

/**
 * Reject the match and return the deposit to the pool.
 *
 * Releasing the claim is what makes the deposit available to the document
 * matcher again; leaving it linked would keep it marked as explained by a
 * payout the owner has just said it is not.
 */
export async function rejectPayoutMatchAction(
  settlementId: string
): Promise<PayoutActionResult> {
  const orgId = await getVerifiedOrgId();
  if (!orgId) return { success: false, error: "No organization selected" };

  const released = await unlinkSettlement(orgId, settlementId);
  if (!released) return { success: false, error: "Settlement not found" };

  revalidate();
  return { success: true };
}
