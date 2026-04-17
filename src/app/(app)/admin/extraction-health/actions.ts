"use server";

import { requireOrgAdmin } from "@/lib/utils/admin-guard";
import { retireGlobalExemplarById } from "@/lib/db/queries/global-exemplar-pool";
import { softDeleteExemplarsByVendor } from "@/lib/db/queries/extraction-exemplars";
import { demoteVendorTier } from "@/lib/db/queries/vendor-tier";
import {
  approvePattern,
  activatePattern,
  retirePattern,
  getPatternById,
} from "@/lib/db/queries/compiled-patterns";
import { revalidatePath } from "next/cache";

export async function retireGlobalExemplarAction(poolId: string) {
  await requireOrgAdmin();
  await retireGlobalExemplarById(poolId);
  revalidatePath("/admin/extraction-health");
}

export async function forgetVendorExemplarsAction(vendorId: string) {
  const { orgId } = await requireOrgAdmin();
  await softDeleteExemplarsByVendor(orgId, vendorId);
  await demoteVendorTier(orgId, vendorId, 0);
  revalidatePath("/admin/extraction-health");
}

export async function approvePatternAction(patternId: string) {
  await requireOrgAdmin();
  await approvePattern(patternId);

  // If shadow accuracy >=95%, activate
  const pattern = await getPatternById(patternId);
  if (
    pattern &&
    pattern.shadowAccuracy &&
    parseFloat(pattern.shadowAccuracy) >= 0.95
  ) {
    await activatePattern(patternId);
  }

  revalidatePath("/admin/extraction-health");
}

export async function rejectPatternAction(patternId: string) {
  await requireOrgAdmin();
  await retirePattern(patternId, "rejected_by_admin");
  revalidatePath("/admin/extraction-health");
}
