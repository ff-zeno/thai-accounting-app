"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAllocationRule } from "@/lib/db/queries/allocation-rules";
import { requireOrgAdmin } from "@/lib/utils/admin-guard";

export async function createAllocationRuleAction(formData: FormData) {
  let target = "/settings/allocation-rules";
  try {
    const { orgId } = await requireOrgAdmin();
    const ruleName = String(formData.get("ruleName") ?? "").trim();
    const sourceType = String(formData.get("sourceType") ?? "category") as
      | "gl_account"
      | "vendor"
      | "category";
    const sourceId = String(formData.get("sourceId") ?? "").trim();
    const effectiveFrom = String(formData.get("effectiveFrom") ?? "").trim();
    const effectiveTo = String(formData.get("effectiveTo") ?? "").trim();

    if (!ruleName) throw new Error("Rule name is required");

    const targets = [1, 2]
      .map((index) => ({
        costCenterId: String(formData.get(`target${index}CostCenterId`) ?? "").trim(),
        projectId: String(formData.get(`target${index}ProjectId`) ?? "").trim(),
        percentage: String(formData.get(`target${index}Percentage`) ?? "").trim(),
        notes: String(formData.get(`target${index}Notes`) ?? "").trim(),
      }))
      .filter((targetRow) => targetRow.percentage);

    await createAllocationRule({
      orgId,
      ruleName,
      sourceType,
      sourceId: sourceType === "category" ? "" : sourceId,
      sourceKey: sourceType === "category" ? sourceId : "",
      effectiveFrom,
      effectiveTo,
      targets,
    });
    revalidatePath("/settings/allocation-rules");
    target = "/settings/allocation-rules?status=Allocation%20rule%20created";
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Allocation rule could not be created";
    target = `/settings/allocation-rules?error=${encodeURIComponent(message)}`;
  }
  redirect(target);
}
