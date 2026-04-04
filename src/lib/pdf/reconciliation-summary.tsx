/**
 * Monthly Reconciliation Summary PDF
 *
 * Tables-only v1: period, match rate, matched/unmatched counts,
 * breakdown by match layer, top unmatched items, AI suggestion summary.
 * English + Thai headers, Sarabun font, Buddhist Era dates.
 */

import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  Font,
  StyleSheet,
  renderToBuffer,
} from "@react-pdf/renderer";
import { resolve } from "path";
import { toBuddhistYear } from "@/lib/utils/thai-date";

// ---------------------------------------------------------------------------
// Font registration
// ---------------------------------------------------------------------------

const fontsDir = resolve(process.cwd(), "src/lib/pdf/fonts/Sarabun");

Font.register({
  family: "Sarabun",
  fonts: [
    { src: resolve(fontsDir, "Sarabun-Regular.ttf"), fontWeight: "normal" },
    { src: resolve(fontsDir, "Sarabun-Bold.ttf"), fontWeight: "bold" },
  ],
});

Font.registerHyphenationCallback((word) => [word]);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ReconciliationSummaryData {
  orgName: string;
  period: { month: number; year: number }; // Gregorian year
  matchRate: number;
  totalTransactions: number;
  matchedTransactions: number;
  unmatchedTransactions: number;
  unmatchedAmount: string;
  layerBreakdown: Array<{
    layer: string;
    matchCount: number;
    pct: number;
  }>;
  topUnmatched: Array<{
    date: string;
    amount: string;
    counterparty: string | null;
    description: string | null;
  }>;
  aiSummary: {
    totalSuggestions: number;
    approved: number;
    rejected: number;
    pending: number;
    approvalRate: number | null;
  };
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const s = StyleSheet.create({
  page: {
    fontFamily: "Sarabun",
    fontSize: 9,
    padding: 40,
    color: "#1a1a1a",
  },
  title: {
    fontSize: 16,
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 10,
    textAlign: "center",
    color: "#666",
    marginBottom: 20,
  },
  section: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: "bold",
    marginBottom: 6,
    paddingBottom: 3,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e5e5",
  },
  row: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: "#e5e5e5",
    paddingVertical: 4,
  },
  headerRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#333",
    paddingBottom: 4,
    marginBottom: 2,
  },
  cell: {
    flex: 1,
  },
  cellRight: {
    flex: 1,
    textAlign: "right",
  },
  cellSmall: {
    flex: 0.5,
    textAlign: "right",
  },
  bold: {
    fontWeight: "bold",
  },
  summaryGrid: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  summaryCard: {
    width: "23%",
    padding: 8,
    borderWidth: 1,
    borderColor: "#e5e5e5",
    borderRadius: 4,
  },
  summaryLabel: {
    fontSize: 7,
    color: "#666",
    marginBottom: 2,
  },
  summaryValue: {
    fontSize: 14,
    fontWeight: "bold",
  },
  footer: {
    position: "absolute",
    bottom: 30,
    left: 40,
    right: 40,
    fontSize: 7,
    color: "#999",
    textAlign: "center",
  },
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const THAI_MONTHS = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน",
  "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม",
  "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];

const EN_MONTHS = [
  "January", "February", "March", "April",
  "May", "June", "July", "August",
  "September", "October", "November", "December",
];

function formatPeriod(month: number, year: number): string {
  const beYear = toBuddhistYear(year);
  return `${EN_MONTHS[month - 1]} ${year} / ${THAI_MONTHS[month - 1]} ${beYear}`;
}

function fmtAmount(amount: string): string {
  return parseFloat(amount).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function fmtPct(n: number): string {
  return (n * 100).toFixed(1) + "%";
}

const LAYER_LABELS: Record<string, string> = {
  reference: "Reference Match",
  alias: "Alias Match",
  exact: "Exact Match",
  fuzzy: "Fuzzy Match",
  rule: "Rule-Based",
  multi_signal: "Multi-Signal",
  split: "Split Match",
  ai: "AI Suggested",
  pattern: "Pattern Match",
  unknown: "Unknown",
};

// ---------------------------------------------------------------------------
// PDF Document (React.createElement syntax for SSR)
// ---------------------------------------------------------------------------

const h = React.createElement;

function createReconciliationSummaryDocument(data: ReconciliationSummaryData) {
  return h(Document, { title: "Reconciliation Summary", author: "Thai Accounting App" },
    h(Page, { size: "A4", style: s.page },
      // Title
      h(Text, { style: s.title }, "Reconciliation Summary / สรุปการกระทบยอด"),
      h(Text, { style: s.subtitle },
        `${data.orgName} — ${formatPeriod(data.period.month, data.period.year)}`
      ),

      // Summary cards
      h(View, { style: s.summaryGrid },
        h(View, { style: s.summaryCard },
          h(Text, { style: s.summaryLabel }, "Match Rate / อัตราการจับคู่"),
          h(Text, { style: s.summaryValue }, fmtPct(data.matchRate)),
        ),
        h(View, { style: s.summaryCard },
          h(Text, { style: s.summaryLabel }, "Matched / จับคู่แล้ว"),
          h(Text, { style: s.summaryValue }, String(data.matchedTransactions)),
        ),
        h(View, { style: s.summaryCard },
          h(Text, { style: s.summaryLabel }, "Unmatched / ยังไม่จับคู่"),
          h(Text, { style: s.summaryValue }, String(data.unmatchedTransactions)),
        ),
        h(View, { style: s.summaryCard },
          h(Text, { style: s.summaryLabel }, "Total / ทั้งหมด"),
          h(Text, { style: s.summaryValue }, String(data.totalTransactions)),
        ),
      ),

      // Layer breakdown
      h(View, { style: s.section },
        h(Text, { style: s.sectionTitle }, "Match Breakdown by Layer / รายละเอียดตามวิธีจับคู่"),
        h(View, { style: s.headerRow },
          h(Text, { style: [s.cell, s.bold] }, "Layer"),
          h(Text, { style: [s.cellRight, s.bold] }, "Matches"),
          h(Text, { style: [s.cellSmall, s.bold] }, "%"),
        ),
        ...data.layerBreakdown.map((layer) =>
          h(View, { style: s.row, key: layer.layer },
            h(Text, { style: s.cell }, LAYER_LABELS[layer.layer] ?? layer.layer),
            h(Text, { style: s.cellRight }, String(layer.matchCount)),
            h(Text, { style: s.cellSmall }, `${layer.pct.toFixed(1)}%`),
          )
        ),
      ),

      // AI summary
      h(View, { style: s.section },
        h(Text, { style: s.sectionTitle }, "AI Suggestion Summary / สรุปข้อเสนอ AI"),
        h(View, { style: s.headerRow },
          h(Text, { style: s.cell }, ""),
          h(Text, { style: [s.cellRight, s.bold] }, "Count"),
        ),
        h(View, { style: s.row },
          h(Text, { style: s.cell }, "Total Suggestions"),
          h(Text, { style: s.cellRight }, String(data.aiSummary.totalSuggestions)),
        ),
        h(View, { style: s.row },
          h(Text, { style: s.cell }, "Approved"),
          h(Text, { style: s.cellRight }, String(data.aiSummary.approved)),
        ),
        h(View, { style: s.row },
          h(Text, { style: s.cell }, "Rejected"),
          h(Text, { style: s.cellRight }, String(data.aiSummary.rejected)),
        ),
        h(View, { style: s.row },
          h(Text, { style: s.cell }, "Pending"),
          h(Text, { style: s.cellRight }, String(data.aiSummary.pending)),
        ),
        data.aiSummary.approvalRate !== null &&
          h(View, { style: s.row },
            h(Text, { style: [s.cell, s.bold] }, "Approval Rate"),
            h(Text, { style: [s.cellRight, s.bold] }, `${data.aiSummary.approvalRate.toFixed(1)}%`),
          ),
      ),

      // Top unmatched
      data.topUnmatched.length > 0 &&
        h(View, { style: s.section },
          h(Text, { style: s.sectionTitle },
            "Top Unmatched Transactions / รายการที่ยังไม่จับคู่"
          ),
          h(View, { style: s.headerRow },
            h(Text, { style: [s.cell, s.bold] }, "Date"),
            h(Text, { style: [s.cell, s.bold] }, "Counterparty"),
            h(Text, { style: [s.cellRight, s.bold] }, "Amount (THB)"),
          ),
          ...data.topUnmatched.map((item, i) =>
            h(View, { style: s.row, key: String(i) },
              h(Text, { style: s.cell }, item.date),
              h(Text, { style: s.cell },
                item.counterparty || item.description || "—"
              ),
              h(Text, { style: s.cellRight }, fmtAmount(item.amount)),
            )
          ),
        ),

      // Unmatched total
      h(View, { style: { marginTop: 8 } },
        h(Text, { style: [s.bold, { fontSize: 10 }] },
          `Unmatched Amount / จำนวนเงินที่ยังไม่จับคู่: ${fmtAmount(data.unmatchedAmount)} THB`
        ),
      ),

      // Footer
      h(Text, { style: s.footer },
        `Generated ${new Date().toISOString().split("T")[0]} — Thai Accounting App`
      ),
    ),
  );
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

export async function renderReconciliationSummaryPdf(
  data: ReconciliationSummaryData,
): Promise<Buffer> {
  return renderToBuffer(createReconciliationSummaryDocument(data));
}
