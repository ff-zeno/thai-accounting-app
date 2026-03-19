"use server";

import { revalidatePath } from "next/cache";
import { getVerifiedOrgId } from "@/lib/utils/org-context";
import { getCurrentUserId } from "@/lib/utils/auth";
import {
  createVendor,
  updateVendor,
  softDeleteVendor,
} from "@/lib/db/queries/vendors";
import { auditMutation } from "@/lib/db/helpers/audit-log";

export async function createVendorAction(formData: FormData) {
  const orgId = await getVerifiedOrgId();
  if (!orgId) return { error: "No organization selected" };
  const actorId = await getCurrentUserId() ?? undefined;

  const name = formData.get("name") as string;
  const nameTh = (formData.get("nameTh") as string) || null;
  const taxId = (formData.get("taxId") as string) || null;
  const branchNumber = (formData.get("branchNumber") as string) || null;
  const address = (formData.get("address") as string) || null;
  const addressTh = (formData.get("addressTh") as string) || null;
  const email = (formData.get("email") as string) || null;
  const paymentTermsDays = formData.get("paymentTermsDays")
    ? parseInt(formData.get("paymentTermsDays") as string)
    : null;
  const isVatRegistered = formData.get("isVatRegistered") === "on";
  const entityType = (formData.get("entityType") as string) || "company";
  const country = (formData.get("country") as string) || "TH";

  if (!name) return { error: "Name is required" };

  // Validate tax ID — strip non-digits first
  const cleanTaxId = taxId ? taxId.replace(/\D/g, "") : null;
  if (cleanTaxId && !/^\d{13}$/.test(cleanTaxId)) {
    return { error: "Tax ID must be exactly 13 digits" };
  }

  try {
    const vendor = await createVendor({
      orgId,
      name,
      nameTh,
      taxId: cleanTaxId,
      branchNumber,
      address,
      addressTh,
      email,
      paymentTermsDays,
      isVatRegistered,
      entityType: entityType as "individual" | "company" | "foreign",
      country,
    });

    await auditMutation({
      orgId,
      entityType: "vendor",
      entityId: vendor.id,
      action: "create",
      newValue: { name, nameTh, taxId: cleanTaxId, entityType, country },
      actorId,
    });

    revalidatePath("/vendors");
    return { success: true, vendorId: vendor.id };
  } catch (err: unknown) {
    if (
      err instanceof Error &&
      err.message.includes("vendors_org_tax_branch")
    ) {
      return {
        error:
          "A vendor with this Tax ID and branch already exists in this organization",
      };
    }
    throw err;
  }
}

export async function updateVendorAction(
  vendorId: string,
  formData: FormData
) {
  const orgId = await getVerifiedOrgId();
  if (!orgId) return { error: "No organization selected" };
  const actorId = await getCurrentUserId() ?? undefined;

  const name = formData.get("name") as string;
  const nameTh = (formData.get("nameTh") as string) || null;
  const taxId = (formData.get("taxId") as string) || null;
  const branchNumber = (formData.get("branchNumber") as string) || null;
  const address = (formData.get("address") as string) || null;
  const addressTh = (formData.get("addressTh") as string) || null;
  const email = (formData.get("email") as string) || null;
  const paymentTermsDays = formData.get("paymentTermsDays")
    ? parseInt(formData.get("paymentTermsDays") as string)
    : null;
  const isVatRegistered = formData.get("isVatRegistered") === "on";
  const entityType = (formData.get("entityType") as string) || "company";
  const country = (formData.get("country") as string) || "TH";

  if (taxId && !/^\d{13}$/.test(taxId)) {
    return { error: "Tax ID must be exactly 13 digits" };
  }

  await updateVendor(orgId, vendorId, {
    name,
    nameTh,
    taxId,
    branchNumber,
    address,
    addressTh,
    email,
    paymentTermsDays,
    isVatRegistered,
    entityType: entityType as "individual" | "company" | "foreign",
    country,
  });

  await auditMutation({
    orgId,
    entityType: "vendor",
    entityId: vendorId,
    action: "update",
    newValue: { name, nameTh, taxId, entityType, country },
    actorId,
  });

  revalidatePath("/vendors");
  return { success: true };
}

export async function deleteVendorAction(vendorId: string) {
  const orgId = await getVerifiedOrgId();
  if (!orgId) return { error: "No organization selected" };
  const actorId = await getCurrentUserId() ?? undefined;

  await softDeleteVendor(orgId, vendorId);

  await auditMutation({
    orgId,
    entityType: "vendor",
    entityId: vendorId,
    action: "delete",
    actorId,
  });

  revalidatePath("/vendors");
  return { success: true };
}
