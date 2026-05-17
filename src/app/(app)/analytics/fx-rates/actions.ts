"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { previousBangkokMonthEnd, runFxRevaluation } from "@/lib/analytics/fx-revaluation";
import { recordBotFxRate } from "@/lib/db/queries/fx-rates-bot";
import { requireOrgAdmin } from "@/lib/utils/admin-guard";

function todayBangkok() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function validatePastOrTodayDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error("Valuation date must use YYYY-MM-DD format");
  }
  if (value > todayBangkok()) {
    throw new Error("Valuation date cannot be in the future");
  }
}

function publicFxRevaluationError(error: unknown) {
  if (!(error instanceof Error)) return "FX revaluation could not be run";
  if (
    error.message.startsWith("Missing BOT FX rate") ||
    error.message.startsWith("GL period is locked") ||
    error.message.startsWith("Valuation date")
  ) {
    return error.message;
  }
  return "FX revaluation could not be run. Check period locks, rates, and accounting setup.";
}

export async function recordBotFxRateAction(formData: FormData) {
  let target = "/analytics/fx-rates";
  try {
    const { orgId, userId } = await requireOrgAdmin();
    const rateDate = String(formData.get("rateDate") ?? "").trim();
    const currency = String(formData.get("currency") ?? "").trim();
    const buyingRate = String(formData.get("buyingRate") ?? "").trim();
    const sellingRate = String(formData.get("sellingRate") ?? "").trim();
    const midRate = String(formData.get("midRate") ?? "").trim();
    const sourceUrl = String(formData.get("sourceUrl") ?? "").trim();

    if (!rateDate || !currency || !midRate || !sourceUrl) {
      throw new Error("Rate date, currency, mid rate, and source URL are required");
    }

    await recordBotFxRate({
      auditOrgId: orgId,
      actorId: userId,
      rateDate,
      currency,
      buyingRate,
      sellingRate,
      midRate,
      sourceUrl,
    });
    revalidatePath("/analytics/fx-rates");
    target = "/analytics/fx-rates?status=FX%20rate%20recorded";
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "FX rate could not be recorded";
    target = `/analytics/fx-rates?error=${encodeURIComponent(message)}`;
  }
  redirect(target);
}

export async function runFxRevaluationAction(formData: FormData) {
  let target = "/analytics/fx-rates";
  try {
    const { orgId, userId } = await requireOrgAdmin();
    const valuationDate = String(formData.get("valuationDate") ?? "").trim();
    if (!valuationDate) throw new Error("Valuation date is required");
    validatePastOrTodayDate(valuationDate);

    const result = await runFxRevaluation({
      orgId,
      valuationDate,
      createdByUserId: userId,
    });

    revalidatePath("/analytics/fx-rates");
    const summary = `FX revaluation run: ${result.layerCount} layers, ${result.journalEntryId ? "journal entry posted" : "no journal entry needed"}`;
    target = `/analytics/fx-rates?status=${encodeURIComponent(summary)}`;
  } catch (error) {
    target = `/analytics/fx-rates?error=${encodeURIComponent(publicFxRevaluationError(error))}`;
  }
  redirect(target);
}

export async function retryPreviousMonthEndFxRevaluationAction() {
  let target = "/analytics/fx-rates";
  try {
    const { orgId, userId } = await requireOrgAdmin();
    const valuationDate = previousBangkokMonthEnd();
    const result = await runFxRevaluation({
      orgId,
      valuationDate,
      createdByUserId: userId,
    });

    revalidatePath("/analytics/fx-rates");
    const summary = `Previous month-end FX retry (${valuationDate}): ${result.layerCount} layers, ${result.journalEntryId ? "journal entry posted" : "no journal entry needed"}`;
    target = `/analytics/fx-rates?status=${encodeURIComponent(summary)}`;
  } catch (error) {
    target = `/analytics/fx-rates?error=${encodeURIComponent(publicFxRevaluationError(error))}`;
  }
  redirect(target);
}
