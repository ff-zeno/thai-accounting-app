"use server";

import { revalidatePath } from "next/cache";
import { createProject } from "@/lib/db/queries/projects";
import { getActiveOrgId } from "@/lib/utils/org-context";

export async function createProjectAction(formData: FormData) {
  const orgId = await getActiveOrgId();
  if (!orgId) return { error: "Organization required" };

  const code = String(formData.get("code") ?? "").trim();
  const nameEn = String(formData.get("nameEn") ?? "").trim();
  const nameTh = String(formData.get("nameTh") ?? "").trim();
  const customerVendorId = String(formData.get("customerVendorId") ?? "").trim();
  const startDate = String(formData.get("startDate") ?? "").trim();
  const endDate = String(formData.get("endDate") ?? "").trim();
  const status = String(formData.get("status") ?? "active") as
    | "planned"
    | "active"
    | "paused"
    | "completed"
    | "cancelled";

  if (!code || !nameEn) return { error: "Code and English name are required" };

  await createProject({
    orgId,
    code,
    nameEn,
    nameTh,
    customerVendorId,
    startDate,
    endDate,
    status,
    isActive: formData.get("isActive") !== "off",
  });
  revalidatePath("/settings/projects");
  return { ok: true };
}
