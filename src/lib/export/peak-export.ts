/**
 * Peak Accounts-compatible CSV export.
 *
 * Peak Accounts is a Thai cloud accounting platform. This generates CSV
 * in a format compatible with Peak's spreadsheet import.
 *
 * Key format differences from FlowAccount:
 * - Dates in Gregorian YYYY-MM-DD format (not Buddhist Era)
 * - Tax ID formatted with dashes (X-XXXX-XXXXX-XX-X)
 * - Different column ordering
 * - UTF-8 with BOM for Thai Excel compatibility
 */

import { and, eq, gte, lte, isNull } from "drizzle-orm";
import { db } from "@/lib/db/index";
import { documents, vendors, documentLineItems } from "@/lib/db/schema";
import { buildCsv, formatAmount } from "./csv-utils";

// ---------------------------------------------------------------------------
// Peak CSV column headers (Thai)
// ---------------------------------------------------------------------------

const PEAK_HEADERS = [
  "\u0E27\u0E31\u0E19\u0E17\u0E35\u0E48", // วันที่
  "\u0E40\u0E25\u0E02\u0E17\u0E35\u0E48\u0E40\u0E2D\u0E01\u0E2A\u0E32\u0E23", // เลขที่เอกสาร
  "\u0E0A\u0E37\u0E48\u0E2D\u0E1C\u0E39\u0E49\u0E02\u0E32\u0E22/\u0E1C\u0E39\u0E49\u0E0B\u0E37\u0E49\u0E2D", // ชื่อผู้ขาย/ผู้ซื้อ
  "\u0E40\u0E25\u0E02\u0E1B\u0E23\u0E30\u0E08\u0E33\u0E15\u0E31\u0E27\u0E1C\u0E39\u0E49\u0E40\u0E2A\u0E35\u0E22\u0E20\u0E32\u0E29\u0E35", // เลขประจำตัวผู้เสียภาษี
  "\u0E2A\u0E32\u0E02\u0E32", // สาขา
  "\u0E23\u0E32\u0E22\u0E25\u0E30\u0E40\u0E2D\u0E35\u0E22\u0E14", // รายละเอียด
  "\u0E08\u0E33\u0E19\u0E27\u0E19\u0E40\u0E07\u0E34\u0E19\u0E01\u0E48\u0E2D\u0E19\u0E20\u0E32\u0E29\u0E35", // จำนวนเงินก่อนภาษี
  "\u0E20\u0E32\u0E29\u0E35\u0E21\u0E39\u0E25\u0E04\u0E48\u0E32\u0E40\u0E1E\u0E34\u0E48\u0E21", // ภาษีมูลค่าเพิ่ม
  "\u0E23\u0E27\u0E21\u0E17\u0E31\u0E49\u0E07\u0E2A\u0E34\u0E49\u0E19", // รวมทั้งสิ้น
  "\u0E2B\u0E31\u0E01 \u0E13 \u0E17\u0E35\u0E48\u0E08\u0E48\u0E32\u0E22 (%)", // หัก ณ ที่จ่าย (%)
  "\u0E08\u0E33\u0E19\u0E27\u0E19\u0E2B\u0E31\u0E01 \u0E13 \u0E17\u0E35\u0E48\u0E08\u0E48\u0E32\u0E22", // จำนวนหัก ณ ที่จ่าย
  "\u0E27\u0E31\u0E19\u0E04\u0E23\u0E1A\u0E01\u0E33\u0E2B\u0E19\u0E14", // วันครบกำหนด
  "\u0E27\u0E34\u0E18\u0E35\u0E0A\u0E33\u0E23\u0E30\u0E40\u0E07\u0E34\u0E19", // วิธีชำระเงิน
] as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PeakExportResult {
  csv: string;
  filename: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Format a 13-digit Thai tax ID with dashes: X-XXXX-XXXXX-XX-X
 * Peak Accounts expects this format.
 */
function formatTaxIdWithDashes(taxId: string | null): string {
  if (!taxId) return "";
  // Strip any existing non-digit characters
  const digits = taxId.replace(/\D/g, "");
  if (digits.length !== 13) return taxId;
  return `${digits[0]}-${digits.slice(1, 5)}-${digits.slice(5, 10)}-${digits.slice(10, 12)}-${digits[12]}`;
}

// ---------------------------------------------------------------------------
// Main export function
// ---------------------------------------------------------------------------

export async function generatePeakExport(
  orgId: string,
  dateFrom: string,
  dateTo: string,
  direction: "expense" | "income" | "all"
): Promise<PeakExportResult> {
  // Build conditions: org-scoped, date-filtered, non-deleted
  const conditions = [
    eq(documents.orgId, orgId),
    isNull(documents.deletedAt),
    gte(documents.issueDate, dateFrom),
    lte(documents.issueDate, dateTo),
  ];

  if (direction !== "all") {
    conditions.push(eq(documents.direction, direction));
  }

  // Fetch documents with vendor info
  const docs = await db
    .select({
      id: documents.id,
      documentNumber: documents.documentNumber,
      issueDate: documents.issueDate,
      dueDate: documents.dueDate,
      subtotal: documents.subtotal,
      vatAmount: documents.vatAmount,
      totalAmount: documents.totalAmount,
      direction: documents.direction,
      vendorName: vendors.name,
      vendorNameTh: vendors.nameTh,
      vendorTaxId: vendors.taxId,
      vendorBranchNumber: vendors.branchNumber,
    })
    .from(documents)
    .leftJoin(vendors, eq(documents.vendorId, vendors.id))
    .where(and(...conditions))
    .orderBy(documents.issueDate);

  // Fetch line items for WHT info (aggregate per document)
  const docIds = docs.map((d) => d.id);
  const lineItemsByDoc = new Map<
    string,
    { whtRate: string | null; whtAmount: string | null }
  >();

  if (docIds.length > 0) {
    const lineItems = await db
      .select({
        documentId: documentLineItems.documentId,
        whtRate: documentLineItems.whtRate,
        whtAmount: documentLineItems.whtAmount,
      })
      .from(documentLineItems)
      .where(
        and(
          eq(documentLineItems.orgId, orgId),
          isNull(documentLineItems.deletedAt)
        )
      );

    // Aggregate WHT: take the max rate and sum amounts per document
    for (const li of lineItems) {
      const existing = lineItemsByDoc.get(li.documentId);
      const currentRate = parseFloat(li.whtRate ?? "0");
      const currentAmount = parseFloat(li.whtAmount ?? "0");

      if (!existing) {
        lineItemsByDoc.set(li.documentId, {
          whtRate: li.whtRate,
          whtAmount: li.whtAmount,
        });
      } else {
        const existingRate = parseFloat(existing.whtRate ?? "0");
        const existingAmount = parseFloat(existing.whtAmount ?? "0");
        lineItemsByDoc.set(li.documentId, {
          whtRate:
            currentRate > existingRate ? li.whtRate : existing.whtRate,
          whtAmount: (existingAmount + currentAmount).toFixed(2),
        });
      }
    }
  }

  // Build CSV rows — Peak uses Gregorian dates and dashed tax IDs
  const rows: string[][] = docs.map((doc) => {
    const whtInfo = lineItemsByDoc.get(doc.id);
    const whtRatePercent = whtInfo?.whtRate
      ? (parseFloat(whtInfo.whtRate) * 100).toFixed(0)
      : "";

    return [
      doc.issueDate ?? "", // YYYY-MM-DD (Gregorian)
      doc.documentNumber ?? "",
      doc.vendorNameTh ?? doc.vendorName ?? "",
      formatTaxIdWithDashes(doc.vendorTaxId),
      doc.vendorBranchNumber ?? "00000",
      "", // description
      formatAmount(doc.subtotal),
      formatAmount(doc.vatAmount),
      formatAmount(doc.totalAmount),
      whtRatePercent,
      formatAmount(whtInfo?.whtAmount),
      doc.dueDate ?? "", // YYYY-MM-DD (Gregorian)
      "", // payment method
    ];
  });

  const csv = buildCsv(PEAK_HEADERS, rows);

  const directionLabel = direction === "all" ? "all" : direction;
  const filename = `peak_${directionLabel}_${dateFrom}_${dateTo}.csv`;

  return { csv, filename };
}
