"use server";

import { revalidatePath } from "next/cache";
import { getVerifiedOrgId } from "@/lib/utils/org-context";
import {
  createBankAccount,
  updateBankAccount,
} from "@/lib/db/queries/bank-accounts";

export async function createBankAccountAction(formData: FormData) {
  const orgId = await getVerifiedOrgId();
  if (!orgId) return { error: "No organization selected" };

  const bankCode = formData.get("bankCode") as string;
  const accountNumberRaw = formData.get("accountNumber") as string;
  const accountName = (formData.get("accountName") as string) || null;
  const currency = (formData.get("currency") as string) || "THB";

  if (!bankCode) return { error: "Bank is required" };
  if (!accountNumberRaw) return { error: "Account number is required" };

  // Store digits only
  const accountNumber = accountNumberRaw.replace(/\D/g, "");
  if (accountNumber.length < 5 || accountNumber.length > 20) {
    return { error: "Account number must be 5–20 digits" };
  }

  if (currency && !/^[A-Z]{3}$/.test(currency)) {
    return { error: "Currency must be a 3-letter code" };
  }

  const account = await createBankAccount({
    orgId,
    bankCode,
    accountNumber,
    accountName,
    currency,
  });

  revalidatePath("/bank-accounts");
  return { success: true, accountId: account.id };
}

export async function updateBankAccountAction(
  accountId: string,
  formData: FormData
) {
  const orgId = await getVerifiedOrgId();
  if (!orgId) return { error: "No organization selected" };

  const bankCode = formData.get("bankCode") as string;
  const accountNumber = formData.get("accountNumber") as string;
  const accountName = (formData.get("accountName") as string) || null;
  const currency = (formData.get("currency") as string) || "THB";

  await updateBankAccount(orgId, accountId, {
    bankCode,
    accountNumber,
    accountName,
    currency,
  });

  revalidatePath("/bank-accounts");
  return { success: true };
}

/** Check if a CSV is KBank format (used by the UI to skip column mapping) */
export async function detectBankFormatAction(csvText: string) {
  const { detectKBankFormat } = await import("@/lib/parsers/kbank-parser");
  const format = detectKBankFormat(csvText);
  return { isKBank: format !== null, format };
}
