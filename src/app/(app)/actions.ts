"use server";

import { revalidatePath } from "next/cache";
import { setActiveOrgId } from "@/lib/utils/org-context";
import {
  createOrganization,
  updateOrganization,
  isUserMemberOfOrg,
  addOrgMembership,
} from "@/lib/db/queries/organizations";
import { getCurrentUser } from "@/lib/utils/auth";
import { requireOrgAdmin } from "@/lib/utils/admin-guard";

export async function createOrgAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) return { error: "Not authenticated" };

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

  // Make the creating user an owner of the new org
  await addOrgMembership(org.id, user.id, "owner");

  await setActiveOrgId(org.id);
  revalidatePath("/", "layout");
  return { success: true, orgId: org.id };
}

export async function updateOrgAction(orgId: string, formData: FormData) {
  const { orgId: activeOrgId } = await requireOrgAdmin();
  if (activeOrgId !== orgId) return { error: "Access denied" };

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
  const user = await getCurrentUser();
  if (!user) return;

  // Verify user has access to this org before switching
  const hasAccess = await isUserMemberOfOrg(user.id, orgId);
  if (!hasAccess) return;

  await setActiveOrgId(orgId);
  revalidatePath("/", "layout");
}
