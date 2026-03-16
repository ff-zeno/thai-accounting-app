"use server";

import { revalidatePath } from "next/cache";
import { setActiveOrgId } from "@/lib/utils/org-context";
import {
  createOrganization,
  updateOrganization,
} from "@/lib/db/queries/organizations";

export async function createOrgAction(formData: FormData) {
  const name = formData.get("name") as string;
  const nameTh = (formData.get("nameTh") as string) || null;
  const taxId = formData.get("taxId") as string;
  const branchNumber = (formData.get("branchNumber") as string) || "00000";
  const registrationNo = (formData.get("registrationNo") as string) || null;
  const address = (formData.get("address") as string) || null;
  const addressTh = (formData.get("addressTh") as string) || null;
  const isVatRegistered = formData.get("isVatRegistered") === "on";
  const fiscalYearEndMonth = parseInt(
    (formData.get("fiscalYearEndMonth") as string) || "12"
  );
  const fiscalYearEndDay = parseInt(
    (formData.get("fiscalYearEndDay") as string) || "31"
  );

  // Validate tax ID format
  if (!/^\d{13}$/.test(taxId)) {
    return { error: "Tax ID must be exactly 13 digits" };
  }

  // Validate branch number format
  if (!/^\d{5}$/.test(branchNumber)) {
    return { error: "Branch number must be exactly 5 digits" };
  }

  const org = await createOrganization({
    name,
    nameTh,
    taxId,
    branchNumber,
    registrationNo,
    address,
    addressTh,
    isVatRegistered,
    fiscalYearEndMonth,
    fiscalYearEndDay,
  });

  await setActiveOrgId(org.id);
  revalidatePath("/", "layout");
  return { success: true, orgId: org.id };
}

export async function updateOrgAction(orgId: string, formData: FormData) {
  const name = formData.get("name") as string;
  const nameTh = (formData.get("nameTh") as string) || null;
  const taxId = formData.get("taxId") as string;
  const branchNumber = (formData.get("branchNumber") as string) || "00000";
  const registrationNo = (formData.get("registrationNo") as string) || null;
  const address = (formData.get("address") as string) || null;
  const addressTh = (formData.get("addressTh") as string) || null;
  const isVatRegistered = formData.get("isVatRegistered") === "on";
  const fiscalYearEndMonth = parseInt(
    (formData.get("fiscalYearEndMonth") as string) || "12"
  );
  const fiscalYearEndDay = parseInt(
    (formData.get("fiscalYearEndDay") as string) || "31"
  );

  if (!/^\d{13}$/.test(taxId)) {
    return { error: "Tax ID must be exactly 13 digits" };
  }

  if (!/^\d{5}$/.test(branchNumber)) {
    return { error: "Branch number must be exactly 5 digits" };
  }

  await updateOrganization(orgId, {
    name,
    nameTh,
    taxId,
    branchNumber,
    registrationNo,
    address,
    addressTh,
    isVatRegistered,
    fiscalYearEndMonth,
    fiscalYearEndDay,
  });

  revalidatePath("/", "layout");
  return { success: true };
}

export async function switchOrgAction(orgId: string) {
  await setActiveOrgId(orgId);
  revalidatePath("/", "layout");
}
