"use server";

import { revalidatePath } from "next/cache";
import { createCostCenter } from "@/lib/db/queries/cost-centers";
import { getActiveOrgId } from "@/lib/utils/org-context";

export async function createCostCenterAction(formData: FormData) {
  const orgId = await getActiveOrgId();
  if (!orgId) return { error: "Organization required" };

  const code = String(formData.get("code") ?? "").trim();
  const nameEn = String(formData.get("nameEn") ?? "").trim();
  const nameTh = String(formData.get("nameTh") ?? "").trim();
  const parentId = String(formData.get("parentId") ?? "").trim();

  if (!code || !nameEn) return { error: "Code and English name are required" };

  await createCostCenter({
    orgId,
    code,
    nameEn,
    nameTh,
    parentId,
    isActive: formData.get("isActive") !== "off",
  });
  revalidatePath("/settings/cost-centers");
  return { ok: true };
}
