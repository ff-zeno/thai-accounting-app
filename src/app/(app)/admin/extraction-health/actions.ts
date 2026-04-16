"use server";

import { requireOrgAdmin } from "@/lib/utils/admin-guard";
import { retireGlobalExemplarById } from "@/lib/db/queries/global-exemplar-pool";
import { revalidatePath } from "next/cache";

export async function retireGlobalExemplarAction(poolId: string) {
  await requireOrgAdmin();
  await retireGlobalExemplarById(poolId);
  revalidatePath("/admin/extraction-health");
}
