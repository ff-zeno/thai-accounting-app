"use server";

import { revalidatePath } from "next/cache";
import { getActiveOrgId } from "@/lib/utils/org-context";
import {
  createVendor,
  updateVendor,
  softDeleteVendor,
} from "@/lib/db/queries/vendors";

export async function createVendorAction(formData: FormData) {
  const orgId = await getActiveOrgId();
  if (!orgId) return { error: "No organization selected" };

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

  if (taxId && !/^\d{13}$/.test(taxId)) {
    return { error: "Tax ID must be exactly 13 digits" };
  }

  try {
    const vendor = await createVendor({
      orgId,
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
  const orgId = await getActiveOrgId();
  if (!orgId) return { error: "No organization selected" };

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

  revalidatePath("/vendors");
  return { success: true };
}

export async function deleteVendorAction(vendorId: string) {
  const orgId = await getActiveOrgId();
  if (!orgId) return { error: "No organization selected" };

  await softDeleteVendor(orgId, vendorId);
  revalidatePath("/vendors");
  return { success: true };
}
