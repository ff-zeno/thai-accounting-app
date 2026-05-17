"use server";

import { revalidatePath } from "next/cache";
import { requireOrgAdmin } from "@/lib/utils/admin-guard";
import {
  buildDepreciationScheduleForAsset,
  createFixedAsset,
  disposeFixedAsset,
  enqueueDepreciationPostingForPeriod,
  importFixedAssetsCsv,
} from "@/lib/db/queries/fixed-assets";

function stringField(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

export async function createFixedAssetAction(formData: FormData) {
  const { orgId } = await requireOrgAdmin();
  const nameEn = stringField(formData, "nameEn");
  const category = stringField(formData, "category");
  const acquisitionDate = stringField(formData, "acquisitionDate");
  const originalCost = stringField(formData, "originalCost");

  if (!nameEn || !category || !acquisitionDate || !originalCost) {
    return { error: "Asset name, category, acquisition date, and cost are required" };
  }

  try {
    const usefulLifeMonths = Number(stringField(formData, "usefulLifeMonths"));
    const asset = await createFixedAsset({
      orgId,
      assetCode: stringField(formData, "assetCode"),
      nameEn,
      nameTh: stringField(formData, "nameTh"),
      category,
      acquisitionDate,
      originalCost,
      salvageValue: stringField(formData, "salvageValue") || "0.00",
      usefulLifeMonths: Number.isFinite(usefulLifeMonths) && usefulLifeMonths >= 0
        ? usefulLifeMonths
        : undefined,
      depreciationStartDate:
        stringField(formData, "depreciationStartDate") || acquisitionDate,
      serialNumber: stringField(formData, "serialNumber"),
      location: stringField(formData, "location"),
      notes: stringField(formData, "notes"),
    });
    revalidatePath("/fixed-assets");
    return { success: true, assetId: asset.id };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Fixed asset could not be saved",
    };
  }
}

export async function importFixedAssetsCsvAction(formData: FormData) {
  const { orgId } = await requireOrgAdmin();
  const csvText = stringField(formData, "csvText");
  if (!csvText) {
    return { error: "Paste fixed asset CSV rows before importing" };
  }

  try {
    const result = await importFixedAssetsCsv({ orgId, csvText });
    revalidatePath("/fixed-assets");
    revalidatePath("/fixed-assets/import");
    return { success: true, ...result };
  } catch (error) {
    return {
      error:
        error instanceof Error ? error.message : "Fixed asset CSV could not be imported",
    };
  }
}

export async function buildAssetDepreciationScheduleAction(formData: FormData) {
  const { orgId } = await requireOrgAdmin();
  const assetId = stringField(formData, "assetId");
  if (!assetId) return { error: "Asset is required" };

  try {
    const rows = await buildDepreciationScheduleForAsset({ orgId, assetId });
    revalidatePath("/fixed-assets");
    return { success: true, rowsCreated: rows.length };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Depreciation schedule could not be built",
    };
  }
}

export async function postAssetDepreciationForPeriodAction(formData: FormData) {
  const { orgId, userId } = await requireOrgAdmin();
  const periodYear = Number(stringField(formData, "periodYear"));
  const periodMonth = Number(stringField(formData, "periodMonth"));

  if (!Number.isInteger(periodYear) || !Number.isInteger(periodMonth)) {
    return { error: "Depreciation period year and month are required" };
  }

  try {
    const result = await enqueueDepreciationPostingForPeriod({
      orgId,
      periodYear,
      periodMonth,
      createdByUserId: userId,
    });
    revalidatePath("/fixed-assets");
    return { success: true, ...result };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Depreciation could not be posted",
    };
  }
}

export async function disposeFixedAssetAction(formData: FormData) {
  const { orgId } = await requireOrgAdmin();
  const assetId = stringField(formData, "assetId");
  const disposedAt = stringField(formData, "disposedAt");
  const disposalProceeds = stringField(formData, "disposalProceeds");

  if (!assetId || !disposedAt || !disposalProceeds) {
    return { error: "Asset, disposal date, and proceeds are required" };
  }

  try {
    const asset = await disposeFixedAsset({
      orgId,
      assetId,
      disposedAt,
      disposalProceeds,
    });
    revalidatePath("/fixed-assets");
    return { success: true, assetId: asset.id };
  } catch (error) {
    return {
      error:
        error instanceof Error ? error.message : "Fixed asset could not be disposed",
    };
  }
}
