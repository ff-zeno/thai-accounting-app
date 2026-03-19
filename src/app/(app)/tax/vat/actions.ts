"use server";

import { revalidatePath } from "next/cache";
import { getActiveOrgId } from "@/lib/utils/org-context";
import {
  computeVatForPeriod,
  upsertVatRecord,
  getVatRecordForPeriod,
  markPp30Filed,
  markPp36Filed,
  computePp30Deadline,
  computePp36Deadline,
  getPp36Documents,
  getCreditNoteAdjustments,
} from "@/lib/db/queries/vat-records";
import { generateVatRegister } from "@/lib/tax/vat-register";

// ---------------------------------------------------------------------------
// Load VAT data for a period
// ---------------------------------------------------------------------------

export async function loadVatDataAction(year: number, month: number) {
  const orgId = await getActiveOrgId();
  if (!orgId) return { error: "No organization selected" };

  if (month < 1 || month > 12) return { error: "Month must be between 1 and 12" };
  if (year < 2000 || year > 2100) return { error: "Year is out of range" };

  // Compute VAT from confirmed documents
  const vat = await computeVatForPeriod(orgId, year, month);

  // Get credit note adjustments
  const creditNotes = await getCreditNoteAdjustments(orgId, year, month);

  // Compute deadlines
  const pp30Deadline = computePp30Deadline(year, month);
  const pp36DeadlineStr = computePp36Deadline(year, month);

  // Nil filing: both output and input are zero
  const nilFilingRequired =
    parseFloat(vat.outputVat) === 0 && parseFloat(vat.inputVatPp30) === 0;

  // Upsert the VAT record
  await upsertVatRecord({
    orgId,
    periodYear: year,
    periodMonth: month,
    outputVat: vat.outputVat,
    inputVatPp30: vat.inputVatPp30,
    pp36ReverseCharge: vat.pp36ReverseCharge,
    netVatPayable: vat.netVatPayable,
    pp30Deadline,
    pp36Deadline: pp36DeadlineStr,
    nilFilingRequired,
  });

  // Get the full record (includes filing status)
  const record = await getVatRecordForPeriod(orgId, year, month);

  // Get PP 36 triggering documents
  const pp36Documents = await getPp36Documents(orgId, year, month);

  return {
    success: true,
    record,
    pp36Documents,
    creditNotes,
  };
}

// ---------------------------------------------------------------------------
// Mark PP 30 as filed
// ---------------------------------------------------------------------------

export async function markPp30FiledAction(recordId: string) {
  const orgId = await getActiveOrgId();
  if (!orgId) return { error: "No organization selected" };

  await markPp30Filed(orgId, recordId);
  revalidatePath("/tax/vat");
  return { success: true };
}

// ---------------------------------------------------------------------------
// Mark PP 36 as filed
// ---------------------------------------------------------------------------

export async function markPp36FiledAction(recordId: string) {
  const orgId = await getActiveOrgId();
  if (!orgId) return { error: "No organization selected" };

  await markPp36Filed(orgId, recordId);
  revalidatePath("/tax/vat");
  return { success: true };
}

// ---------------------------------------------------------------------------
// Load VAT register for a period
// ---------------------------------------------------------------------------

export async function loadVatRegisterAction(year: number, month: number) {
  const orgId = await getActiveOrgId();
  if (!orgId) return { error: "No organization selected" };

  const register = await generateVatRegister(orgId, year, month);
  return { success: true, register };
}
