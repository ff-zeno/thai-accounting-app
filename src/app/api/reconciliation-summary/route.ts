import { NextRequest, NextResponse } from "next/server";
import { getVerifiedOrgId } from "@/lib/utils/org-context";
import { getOrganizationById } from "@/lib/db/queries/organizations";
import {
  getReconciliationStats,
  getUnmatchedTransactions,
} from "@/lib/db/queries/reconciliation";
import {
  getMatchRateByLayer,
  getAiSuggestionMetrics,
} from "@/lib/db/queries/reconciliation-metrics";
import {
  renderReconciliationSummaryPdf,
  type ReconciliationSummaryData,
} from "@/lib/pdf/reconciliation-summary";

export async function GET(request: NextRequest) {
  const orgId = await getVerifiedOrgId();
  if (!orgId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const monthParam = url.searchParams.get("month"); // Format: YYYY-MM
  if (!monthParam || !/^\d{4}-\d{2}$/.test(monthParam)) {
    return NextResponse.json(
      { error: "month parameter required (YYYY-MM)" },
      { status: 400 },
    );
  }

  const [yearStr, monthStr] = monthParam.split("-");
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);

  if (month < 1 || month > 12) {
    return NextResponse.json({ error: "Invalid month (1-12)" }, { status: 400 });
  }

  const periodStart = `${yearStr}-${monthStr}-01`;
  const periodEnd = new Date(year, month, 0).toISOString().split("T")[0]; // last day of month

  const [org, stats, layerData, aiData, topUnmatched] = await Promise.all([
    getOrganizationById(orgId),
    getReconciliationStats(orgId, periodStart, periodEnd),
    getMatchRateByLayer(orgId, periodStart, `${periodEnd}T23:59:59Z`),
    getAiSuggestionMetrics(orgId),
    getUnmatchedTransactions(orgId, 10),
  ]);

  const data: ReconciliationSummaryData = {
    orgName: org?.name ?? "Organization",
    period: { month, year },
    matchRate: stats.matchRate,
    totalTransactions: stats.totalTransactions,
    matchedTransactions: stats.matchedTransactions,
    unmatchedTransactions: stats.unmatchedTransactions,
    unmatchedAmount: stats.unmatchedAmount,
    layerBreakdown: layerData,
    topUnmatched: topUnmatched.map((t) => ({
      date: t.date,
      amount: t.amount,
      counterparty: t.counterparty,
      description: t.description,
    })),
    aiSummary: {
      totalSuggestions: aiData.totalSuggestions,
      approved: aiData.approved,
      rejected: aiData.rejected,
      pending: aiData.pending,
      approvalRate: aiData.approvalRate,
    },
  };

  let buffer: Buffer;
  try {
    buffer = await renderReconciliationSummaryPdf(data);
  } catch (err) {
    console.error("[reconciliation-summary] PDF render failed:", err);
    return NextResponse.json({ error: "PDF generation failed" }, { status: 500 });
  }

  const filename = `reconciliation-summary-${monthParam}.pdf`;

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
