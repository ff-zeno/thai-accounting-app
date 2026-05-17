"use server";

import { revalidatePath } from "next/cache";
import { requireOrgAdmin } from "@/lib/utils/admin-guard";
import {
  addInventoryCountItem,
  createInventoryCount,
  createSku,
  reconcileInventoryCount,
  recordInventoryMovement,
  updateSkuProfile,
  updateSkuReorderPoint,
} from "@/lib/db/queries/inventory";
import { ensureHeadOfficeEstablishment } from "@/lib/db/queries/pos-sales-ledger";

function stringField(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function normalizeQty(value: FormDataEntryValue | null) {
  const raw = String(value ?? "").trim();
  if (!/^-?\d+(\.\d{1,4})?$/.test(raw) || Number(raw) === 0) {
    throw new Error("Quantity must be a non-zero number with up to 4 decimals");
  }
  const [whole, fraction = ""] = raw.split(".");
  return `${whole}.${fraction.padEnd(4, "0")}`;
}

function normalizePositiveQty(value: FormDataEntryValue | null) {
  const raw = String(value ?? "").trim();
  if (!/^\d+(\.\d{1,4})?$/.test(raw) || Number(raw) === 0) {
    throw new Error("Quantity must be a positive number with up to 4 decimals");
  }
  const [whole, fraction = ""] = raw.split(".");
  return `${whole}.${fraction.padEnd(4, "0")}`;
}

function normalizeCost(value: FormDataEntryValue | null) {
  const raw = String(value ?? "0").trim() || "0";
  if (!/^\d+(\.\d{1,4})?$/.test(raw)) {
    throw new Error("Unit cost must be zero or a positive number with up to 4 decimals");
  }
  const [whole, fraction = ""] = raw.split(".");
  return `${whole}.${fraction.padEnd(4, "0")}`;
}

function normalizeCountDate(value: FormDataEntryValue | null) {
  const raw = String(value ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    throw new Error("Count date is required");
  }
  return raw;
}

export async function createSkuAction(formData: FormData) {
  const { orgId } = await requireOrgAdmin();
  const skuCode = stringField(formData, "skuCode");
  if (!skuCode) return { error: "SKU code is required" };

  try {
    const sku = await createSku({
      orgId,
      skuCode,
      nameEn: stringField(formData, "nameEn"),
      category: stringField(formData, "category"),
      unitOfMeasure: stringField(formData, "unitOfMeasure") || "pcs",
      standardCost: normalizeCost(formData.get("standardCost")),
      reorderPointQuantity: normalizeCost(formData.get("reorderPointQuantity")) ?? "0",
    });
    revalidatePath("/inventory");
    return { success: true, skuId: sku.id };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "SKU could not be saved",
    };
  }
}

export async function updateSkuReorderPointAction(formData: FormData) {
  const { orgId } = await requireOrgAdmin();
  const skuId = stringField(formData, "skuId");
  if (!skuId) return { error: "SKU is required" };

  try {
    await updateSkuReorderPoint({
      orgId,
      skuId,
      reorderPointQuantity: normalizeCost(formData.get("reorderPointQuantity")),
    });
    revalidatePath("/inventory");
    revalidatePath(`/inventory/skus/${skuId}`);
    return { success: true };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Reorder point could not be saved",
    };
  }
}

export async function updateSkuProfileAction(formData: FormData) {
  const { orgId } = await requireOrgAdmin();
  const skuId = stringField(formData, "skuId");
  if (!skuId) return { error: "SKU is required" };

  try {
    await updateSkuProfile({
      orgId,
      skuId,
      nameEn: stringField(formData, "nameEn"),
      category: stringField(formData, "category"),
      unitOfMeasure: stringField(formData, "unitOfMeasure") || "pcs",
      standardCost: normalizeCost(formData.get("standardCost")),
      reorderPointQuantity: normalizeCost(formData.get("reorderPointQuantity")),
    });
    revalidatePath("/inventory");
    revalidatePath(`/inventory/skus/${skuId}`);
    return { success: true };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "SKU profile could not be saved",
    };
  }
}

export async function recordInventoryMovementAction(formData: FormData) {
  const { orgId } = await requireOrgAdmin();
  const skuId = stringField(formData, "skuId");
  const movementType = stringField(formData, "movementType");
  const movementDate = stringField(formData, "movementDate");
  if (!skuId || !movementType || !movementDate) {
    return { error: "SKU, movement type, and date are required" };
  }
  if (!["adjustment_in", "adjustment_out", "shrinkage"].includes(movementType)) {
    return {
      error:
        "Manual inventory movements are limited to audited adjustments. Use sales, import, or document workflows for source-linked movements.",
    };
  }

  try {
    const establishment = await ensureHeadOfficeEstablishment(orgId);
    const absoluteQuantity = normalizePositiveQty(formData.get("quantity"));
    const signedQuantity =
      movementType === "adjustment_in" ? absoluteQuantity : `-${absoluteQuantity}`;
    const movement = await recordInventoryMovement({
      orgId,
      establishmentId: establishment.id,
      skuId,
      movementAt: new Date(`${movementDate}T12:00:00+07:00`),
      movementType,
      quantity: signedQuantity,
      unitCost: normalizeCost(formData.get("unitCost")),
      sourceEntityType: "manual",
      notes: stringField(formData, "notes"),
    });
    revalidatePath("/inventory");
    return { success: true, movementId: movement.id };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Inventory movement could not be saved",
    };
  }
}

export async function recordInventoryAdjustmentAction(formData: FormData) {
  const { orgId } = await requireOrgAdmin();
  const skuId = stringField(formData, "skuId");
  const movementType = stringField(formData, "movementType");
  const movementDate = stringField(formData, "movementDate");
  if (!skuId || !movementType || !movementDate) {
    return { error: "SKU, adjustment type, and date are required" };
  }
  if (!["adjustment_in", "adjustment_out", "shrinkage"].includes(movementType)) {
    return { error: "Unsupported adjustment type" };
  }
  if (movementType === "adjustment_in" && Number(normalizeCost(formData.get("unitCost"))) <= 0) {
    return { error: "Found-stock adjustments require a positive unit cost" };
  }

  try {
    const establishment = await ensureHeadOfficeEstablishment(orgId);
    const absoluteQuantity = normalizePositiveQty(formData.get("quantity"));
    const signedQuantity =
      movementType === "adjustment_in" ? absoluteQuantity : `-${absoluteQuantity}`;
    const movement = await recordInventoryMovement({
      orgId,
      establishmentId: establishment.id,
      skuId,
      movementAt: new Date(`${movementDate}T12:00:00+07:00`),
      movementType,
      quantity: signedQuantity,
      unitCost: normalizeCost(formData.get("unitCost")),
      sourceEntityType: "manual",
      notes: stringField(formData, "notes"),
    });
    revalidatePath("/inventory");
    revalidatePath(`/inventory/skus/${skuId}`);
    revalidatePath("/inventory/adjustments/new");
    return { success: true, movementId: movement.id };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Inventory adjustment could not be saved",
    };
  }
}

export async function createInventoryCountAction(formData: FormData) {
  const { orgId } = await requireOrgAdmin();

  try {
    const establishment = await ensureHeadOfficeEstablishment(orgId);
    const count = await createInventoryCount({
      orgId,
      establishmentId: establishment.id,
      countDate: normalizeCountDate(formData.get("countDate")),
      countType: (stringField(formData, "countType") || "cycle") as
        | "full"
        | "cycle"
        | "spot",
      notes: stringField(formData, "notes"),
    });
    revalidatePath("/inventory");
    return { success: true, countId: count.id };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Inventory count could not be created",
    };
  }
}

export async function addInventoryCountItemAction(formData: FormData) {
  const { orgId } = await requireOrgAdmin();
  const countId = stringField(formData, "countId");
  const skuId = stringField(formData, "countSkuId");
  if (!countId || !skuId) return { error: "Inventory count and SKU are required" };

  try {
    const item = await addInventoryCountItem({
      orgId,
      countId,
      skuId,
      countedQuantity: normalizeQty(formData.get("countedQuantity")),
      varianceReason: (stringField(formData, "varianceReason") || undefined) as
        | "shrinkage"
        | "damage"
        | "count_error"
        | "unrecorded_sale"
        | "other"
        | undefined,
    });
    revalidatePath("/inventory");
    return { success: true, itemId: item.id };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Inventory count item could not be saved",
    };
  }
}

export async function reconcileInventoryCountAction(formData: FormData) {
  const { orgId, userId } = await requireOrgAdmin();
  const countId = stringField(formData, "countId");
  if (!countId) return { error: "Inventory count is required" };

  try {
    const result = await reconcileInventoryCount({ orgId, countId, userId });
    revalidatePath("/inventory");
    return { success: true, movementCount: result.movements.length };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Inventory count could not be reconciled",
    };
  }
}
