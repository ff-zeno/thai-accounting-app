"use server";

import { revalidatePath } from "next/cache";
import { getVerifiedOrgId } from "@/lib/utils/org-context";
import { createWhtCreditReceived } from "@/lib/db/queries/wht-credits-received";

export async function createWhtCreditReceivedAction(formData: FormData) {
  const orgId = await getVerifiedOrgId();
  if (!orgId) return { error: "No organization selected" };

  const customerVendorId = String(formData.get("customerVendorId") ?? "");
  const paymentDate = String(formData.get("paymentDate") ?? "");
  const grossAmount = String(formData.get("grossAmount") ?? "");
  const whtAmount = String(formData.get("whtAmount") ?? "");
  const formType = String(formData.get("formType") ?? "50_tawi");
  const certificateNo = String(formData.get("certificateNo") ?? "");
  const notes = String(formData.get("notes") ?? "");

  if (!customerVendorId || !paymentDate || !grossAmount || !whtAmount) {
    return { error: "Customer, payment date, gross amount, and WHT amount are required" };
  }

  try {
    const id = await createWhtCreditReceived({
      orgId,
      customerVendorId,
      paymentDate,
      grossAmount,
      whtAmount,
      formType,
      certificateNo,
      notes,
    });
    revalidatePath("/tax/wht-credits-received");
    return { success: true, id };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Failed to save WHT credit",
    };
  }
}
