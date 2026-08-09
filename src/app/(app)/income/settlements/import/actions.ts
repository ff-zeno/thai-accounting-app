"use server";

import { revalidatePath } from "next/cache";

import { getVerifiedOrgId } from "@/lib/utils/org-context";
import { inngest } from "@/lib/inngest/client";
import {
  detectSettlementColumns,
  parseSettlementCSV,
} from "@/lib/parsers/settlement-csv";
import type {
  ParsedSettlement,
  SettlementColumnMapping,
  SettlementRowError,
} from "@/lib/parsers/settlement-csv";
import {
  getSettlementMapping,
  importSettlements,
  saveSettlementMapping,
} from "@/lib/db/queries/processor-settlements";

// ---------------------------------------------------------------------------
// Step 1: read the file (no DB writes)
// ---------------------------------------------------------------------------

export interface ReadSettlementFileResult {
  success: boolean;
  error?: string;
  csvText?: string;
  columns?: string[];
  /** The mapping this org used last time for this processor, if still valid. */
  rememberedMapping?: SettlementColumnMapping | null;
}

export async function readSettlementFileAction(
  formData: FormData
): Promise<ReadSettlementFileResult> {
  const orgId = await getVerifiedOrgId();
  if (!orgId) return { success: false, error: "No organization selected" };

  const file = formData.get("file") as File | null;
  if (!file) return { success: false, error: "No file provided" };

  const processor = (formData.get("processor") as string | null)?.trim();
  if (!processor) return { success: false, error: "Processor name is required" };

  const csvText = await file.text();
  const columns = detectSettlementColumns(csvText);
  if (columns.length === 0) {
    return { success: false, error: "Could not detect CSV columns" };
  }

  const rememberedMapping = await getSettlementMapping(
    orgId,
    processor,
    columns
  );

  return { success: true, csvText, columns, rememberedMapping };
}

// ---------------------------------------------------------------------------
// Step 2: preview under a mapping (no DB writes)
// ---------------------------------------------------------------------------

export interface PreviewSettlementsResult {
  settlements: ParsedSettlement[];
  errors: SettlementRowError[];
}

export async function previewSettlementsAction(
  csvText: string,
  mapping: SettlementColumnMapping
): Promise<PreviewSettlementsResult> {
  return parseSettlementCSV(csvText, mapping);
}

// ---------------------------------------------------------------------------
// Step 3: confirm the import (writes)
// ---------------------------------------------------------------------------

export interface ConfirmSettlementImportResult {
  success: boolean;
  error?: string;
  created?: number;
  updated?: number;
  rejected?: number;
  matchesInvalidated?: string[];
}

/**
 * Re-parses server-side rather than trusting rows posted from the client: the
 * balance invariant is what makes a settlement able to explain a bank deposit,
 * so it is enforced where it cannot be bypassed.
 */
export async function confirmSettlementImportAction(input: {
  processor: string;
  csvText: string;
  mapping: SettlementColumnMapping;
}): Promise<ConfirmSettlementImportResult> {
  const orgId = await getVerifiedOrgId();
  if (!orgId) return { success: false, error: "No organization selected" };

  const processor = input.processor.trim();
  if (!processor) return { success: false, error: "Processor name is required" };

  const { settlements, errors } = parseSettlementCSV(input.csvText, input.mapping);
  if (settlements.length === 0) {
    return {
      success: false,
      error: "No valid settlements to import",
      rejected: errors.length,
    };
  }

  const result = await importSettlements({
    orgId,
    processor,
    settlements,
  });

  await saveSettlementMapping(orgId, processor, input.mapping);

  revalidatePath("/income/settlements");
  revalidatePath("/reconciliation/payouts");

  // Match the fresh payouts against deposits already on the statement.
  // Fire-and-forget, following the statement importer: an Inngest outage must
  // not fail an import that has already been committed.
  void inngest
    .send({ name: "settlements/imported", data: { orgId, processor } })
    .catch((err) => {
      console.error(
        "[settlements] Failed to emit settlements/imported event:",
        err
      );
    });

  return {
    success: true,
    created: result.created,
    updated: result.updated,
    rejected: errors.length,
    matchesInvalidated: result.matchesInvalidated,
  };
}
