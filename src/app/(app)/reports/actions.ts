"use server";

import { getActiveOrgId } from "@/lib/utils/org-context";
import { generateFlowAccountExport } from "@/lib/export/flowaccount-export";
import { generatePeakExport } from "@/lib/export/peak-export";
import { generateFullDataExport } from "@/lib/export/full-export";

type Direction = "expense" | "income" | "all";

interface ExportResult {
  csv: string;
  filename: string;
}

interface ExportError {
  error: string;
}

export async function exportFlowAccountAction(
  dateFrom: string,
  dateTo: string,
  direction: Direction
): Promise<ExportResult | ExportError> {
  const orgId = await getActiveOrgId();
  if (!orgId) return { error: "No organization selected" };

  if (!dateFrom || !dateTo) return { error: "Date range is required" };

  const result = await generateFlowAccountExport(
    orgId,
    dateFrom,
    dateTo,
    direction
  );

  return result;
}

export async function exportPeakAction(
  dateFrom: string,
  dateTo: string,
  direction: Direction
): Promise<ExportResult | ExportError> {
  const orgId = await getActiveOrgId();
  if (!orgId) return { error: "No organization selected" };

  if (!dateFrom || !dateTo) return { error: "Date range is required" };

  const result = await generatePeakExport(
    orgId,
    dateFrom,
    dateTo,
    direction
  );

  return result;
}

export async function exportFullDataAction(): Promise<
  | { files: Array<{ filename: string; content: string; format: "json" | "csv" }> }
  | ExportError
> {
  const orgId = await getActiveOrgId();
  if (!orgId) return { error: "No organization selected" };

  const result = await generateFullDataExport(orgId);
  return result;
}
