"use server";

import { getActiveOrgId } from "@/lib/utils/org-context";
import {
  getDashboardMetrics,
  getDocumentSummary,
  getVendorNamesForSummary,
  type DashboardMetrics,
  type SummaryRow,
} from "@/lib/db/queries/dashboard";

export async function getDashboardMetricsAction(
  year: number,
  month: number
): Promise<DashboardMetrics | null> {
  const orgId = await getActiveOrgId();
  if (!orgId) return null;

  return getDashboardMetrics(orgId, year, month);
}

export async function getDocumentSummaryAction(
  direction: "expense" | "income",
  groupBy: "month" | "vendor" | "payment_type",
  filters?: {
    dateFrom?: string;
    dateTo?: string;
    vendorId?: string;
  }
): Promise<{ rows: SummaryRow[]; vendorNames: Record<string, string> }> {
  const orgId = await getActiveOrgId();
  if (!orgId) return { rows: [], vendorNames: {} };

  const rows = await getDocumentSummary(orgId, direction, groupBy, filters);

  // Resolve vendor names when grouped by vendor
  let vendorNames: Record<string, string> = {};
  if (groupBy === "vendor") {
    const vendorIds = rows
      .map((r) => r.groupKey)
      .filter((id) => id !== "unassigned");
    vendorNames = await getVendorNamesForSummary(orgId, vendorIds);
  }

  return { rows, vendorNames };
}
