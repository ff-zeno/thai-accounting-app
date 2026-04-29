/**
 * 50 Tawi WHT Certificate PDF Generator
 *
 * Renders the official "หนังสือรับรองการหักภาษี ณ ที่จ่าย" form
 * using React-PDF with Sarabun Thai font. Uses React.createElement
 * syntax for server-side rendering compatibility.
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
import {
  toBuddhistYear,
  formatThaiDate,
  formatThaiDateShort,
} from "@/lib/utils/thai-date";

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

// Thai doesn't use hyphens for word-wrapping
Font.registerHyphenationCallback((word) => [word]);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FiftyTawiPayer {
  name: string;
  nameTh: string | null;
  taxId: string;
  branchNumber: string;
  address: string | null;
  addressTh: string | null;
}

export interface FiftyTawiPayee {
  name: string;
  nameTh: string | null;
  taxId: string | null;
  branchNumber: string | null;
  address: string | null;
  addressTh: string | null;
}

export interface FiftyTawiItem {
  whtType: string | null;
  rdPaymentTypeCode: string | null;
  baseAmount: string | null;
  whtRate: string | null;
  whtAmount: string | null;
}

export interface FiftyTawiData {
  certificateNo: string;
  formType: "pnd2" | "pnd3" | "pnd53" | "pnd54";
  paymentDate: string | null;
  issuedDate: string | null;
  totalBaseAmount: string | null;
  totalWht: string | null;
  payer: FiftyTawiPayer;
  payee: FiftyTawiPayee;
  items: FiftyTawiItem[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatAmount(value: string | null): string {
  if (!value) return "0.00";
  const num = parseFloat(value);
  if (isNaN(num)) return "0.00";
  return num.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatBranch(branchNumber: string | null | undefined): string {
  if (!branchNumber || branchNumber === "00000") {
    return "สำนักงานใหญ่";
  }
  return branchNumber;
}

function formatCertNoDisplay(certNo: string): string {
  // Internal format: PND3/2026/001 -> display with B.E. year: PND3/2569/001
  const parts = certNo.split("/");
  if (parts.length === 3) {
    const yearNum = parseInt(parts[1], 10);
    if (!isNaN(yearNum)) {
      parts[1] = String(toBuddhistYear(yearNum));
    }
  }
  return parts.join("/");
}

function formTypeCheckbox(formType: string, targetType: string): string {
  return formType === targetType ? "☑" : "☐";
}

// WHT type code to Thai description mapping
const WHT_TYPE_DESCRIPTIONS: Record<string, string> = {
  "40(1)": "เงินเดือน ค่าจ้าง (Salary)",
  "40(2)": "ค่านายหน้า (Commission)",
  "40(3)": "ค่าลิขสิทธิ์ (Royalty)",
  "40(4)(a)": "ดอกเบี้ย (Interest)",
  "40(4)(b)": "เงินปันผล (Dividend)",
  "40(5)": "ค่าเช่าทรัพย์สิน (Rental)",
  "40(6)": "ค่าวิชาชีพอิสระ (Professional fees)",
  "40(7)": "ค่ารับเหมา (Contractor fees)",
  "40(8)": "ค่าบริการ/อื่นๆ (Service fees / Others)",
};

function getWhtTypeDescription(
  whtType: string | null,
  rdCode: string | null
): string {
  if (rdCode && WHT_TYPE_DESCRIPTIONS[rdCode]) {
    return WHT_TYPE_DESCRIPTIONS[rdCode];
  }
  if (whtType) return whtType;
  return "อื่นๆ (Others)";
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  page: {
    fontFamily: "Sarabun",
    fontSize: 9,
    padding: 35,
    backgroundColor: "#ffffff",
  },
  header: {
    textAlign: "center",
    marginBottom: 12,
  },
  title: {
    fontSize: 14,
    fontWeight: "bold",
    marginBottom: 3,
  },
  subtitle: {
    fontSize: 10,
    marginBottom: 2,
  },
  certNoRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginBottom: 8,
  },
  formTypeRow: {
    flexDirection: "row",
    justifyContent: "center",
    marginBottom: 12,
    gap: 16,
    fontSize: 10,
  },
  section: {
    marginBottom: 10,
    padding: 8,
    border: "1px solid #999",
  },
  sectionTitle: {
    fontSize: 10,
    fontWeight: "bold",
    marginBottom: 6,
    backgroundColor: "#f0f0f0",
    padding: 3,
  },
  row: {
    flexDirection: "row",
    marginBottom: 4,
  },
  label: {
    width: 140,
    fontWeight: "bold",
  },
  value: {
    flex: 1,
  },
  // Table styles
  table: {
    marginTop: 6,
    border: "1px solid #000",
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#e0e0e0",
    borderBottom: "1px solid #000",
    fontWeight: "bold",
    fontSize: 8,
  },
  tableRow: {
    flexDirection: "row",
    borderBottom: "1px solid #ccc",
    fontSize: 8,
  },
  totalRow: {
    flexDirection: "row",
    borderTop: "2px solid #000",
    fontWeight: "bold",
    fontSize: 8,
  },
  cellNo: {
    width: 25,
    padding: 3,
    borderRight: "1px solid #ccc",
    textAlign: "center",
  },
  cellType: {
    width: 170,
    padding: 3,
    borderRight: "1px solid #ccc",
  },
  cellDate: {
    width: 70,
    padding: 3,
    borderRight: "1px solid #ccc",
    textAlign: "center",
  },
  cellAmount: {
    width: 80,
    padding: 3,
    borderRight: "1px solid #ccc",
    textAlign: "right",
  },
  cellRate: {
    width: 40,
    padding: 3,
    borderRight: "1px solid #ccc",
    textAlign: "center",
  },
  cellTax: {
    width: 80,
    padding: 3,
    textAlign: "right",
  },
  summarySection: {
    marginTop: 10,
    marginBottom: 10,
  },
  checkboxRow: {
    flexDirection: "row",
    marginBottom: 6,
    gap: 16,
  },
  footer: {
    marginTop: 24,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  signatureBox: {
    width: 180,
    textAlign: "center",
    paddingTop: 36,
  },
  signatureLine: {
    borderTop: "1px solid #000",
    marginTop: 4,
    paddingTop: 4,
  },
});

// ---------------------------------------------------------------------------
// Document component
// ---------------------------------------------------------------------------

function createFiftyTawiDocument(data: FiftyTawiData) {
  const { payer, payee, items } = data;

  const paymentDateDisplay = data.paymentDate
    ? formatThaiDateShort(data.paymentDate)
    : "-";
  const issuedDateDisplay = data.issuedDate
    ? formatThaiDate(data.issuedDate)
    : data.paymentDate
      ? formatThaiDate(data.paymentDate)
      : "-";
  const certNoDisplay = formatCertNoDisplay(data.certificateNo);

  return React.createElement(
    Document,
    {
      title: `50 Tawi - ${data.certificateNo}`,
      author: "Thai Accounting App",
    },
    React.createElement(
      Page,
      { size: "A4", style: styles.page },

      // Header
      React.createElement(
        View,
        { style: styles.header },
        React.createElement(
          Text,
          { style: styles.title },
          "หนังสือรับรองการหักภาษี ณ ที่จ่าย"
        ),
        React.createElement(
          Text,
          { style: styles.subtitle },
          "Withholding Tax Certificate"
        ),
        React.createElement(
          Text,
          { style: { fontSize: 8, color: "#666" } },
          "ตามมาตรา 50 ทวิ แห่งประมวลรัษฎากร"
        )
      ),

      // Certificate number (right-aligned)
      React.createElement(
        View,
        { style: styles.certNoRow },
        React.createElement(
          Text,
          { style: { fontWeight: "bold" } },
          `เลขที่ (No.): ${certNoDisplay}`
        )
      ),

      // Form type checkboxes
      React.createElement(
        View,
        { style: styles.formTypeRow },
        React.createElement(
          Text,
          null,
          `${formTypeCheckbox(data.formType, "pnd2")} ภ.ง.ด.2`
        ),
        React.createElement(
          Text,
          null,
          `${formTypeCheckbox(data.formType, "pnd3")} ภ.ง.ด.3`
        ),
        React.createElement(
          Text,
          null,
          `${formTypeCheckbox(data.formType, "pnd53")} ภ.ง.ด.53`
        ),
        React.createElement(
          Text,
          null,
          `${formTypeCheckbox(data.formType, "pnd54")} ภ.ง.ด.54`
        )
      ),

      // Section 1: Payer
      React.createElement(
        View,
        { style: styles.section },
        React.createElement(
          Text,
          { style: styles.sectionTitle },
          "1. ผู้มีหน้าที่หักภาษี ณ ที่จ่าย (Payer / Withholding Agent)"
        ),
        React.createElement(
          View,
          { style: styles.row },
          React.createElement(
            Text,
            { style: styles.label },
            "ชื่อ (Name):"
          ),
          React.createElement(
            Text,
            { style: styles.value },
            [payer.nameTh, payer.name].filter(Boolean).join(" / ")
          )
        ),
        React.createElement(
          View,
          { style: styles.row },
          React.createElement(
            Text,
            { style: styles.label },
            "เลขประจำตัวผู้เสียภาษี:"
          ),
          React.createElement(Text, { style: styles.value }, payer.taxId)
        ),
        React.createElement(
          View,
          { style: styles.row },
          React.createElement(
            Text,
            { style: styles.label },
            "สาขา (Branch):"
          ),
          React.createElement(
            Text,
            { style: styles.value },
            formatBranch(payer.branchNumber)
          )
        ),
        React.createElement(
          View,
          { style: styles.row },
          React.createElement(
            Text,
            { style: styles.label },
            "ที่อยู่ (Address):"
          ),
          React.createElement(
            Text,
            { style: styles.value },
            payer.addressTh || payer.address || "-"
          )
        )
      ),

      // Section 2: Payee
      React.createElement(
        View,
        { style: styles.section },
        React.createElement(
          Text,
          { style: styles.sectionTitle },
          "2. ผู้ถูกหักภาษี ณ ที่จ่าย (Payee / Income Recipient)"
        ),
        React.createElement(
          View,
          { style: styles.row },
          React.createElement(
            Text,
            { style: styles.label },
            "ชื่อ (Name):"
          ),
          React.createElement(
            Text,
            { style: styles.value },
            [payee.nameTh, payee.name].filter(Boolean).join(" / ")
          )
        ),
        React.createElement(
          View,
          { style: styles.row },
          React.createElement(
            Text,
            { style: styles.label },
            "เลขประจำตัวผู้เสียภาษี:"
          ),
          React.createElement(
            Text,
            { style: styles.value },
            payee.taxId || "-"
          )
        ),
        React.createElement(
          View,
          { style: styles.row },
          React.createElement(
            Text,
            { style: styles.label },
            "สาขา (Branch):"
          ),
          React.createElement(
            Text,
            { style: styles.value },
            formatBranch(payee.branchNumber)
          )
        ),
        React.createElement(
          View,
          { style: styles.row },
          React.createElement(
            Text,
            { style: styles.label },
            "ที่อยู่ (Address):"
          ),
          React.createElement(
            Text,
            { style: styles.value },
            payee.addressTh || payee.address || "-"
          )
        )
      ),

      // Section 3: Payment details table
      React.createElement(
        View,
        { style: styles.section },
        React.createElement(
          Text,
          { style: styles.sectionTitle },
          "3. รายละเอียดการหักภาษี ณ ที่จ่าย (Withholding Tax Details)"
        ),
        React.createElement(
          View,
          { style: styles.table },

          // Table header
          React.createElement(
            View,
            { style: styles.tableHeader },
            React.createElement(Text, { style: styles.cellNo }, "ลำดับ"),
            React.createElement(
              Text,
              { style: styles.cellType },
              "ประเภทเงินได้ (Income Type)"
            ),
            React.createElement(
              Text,
              { style: styles.cellDate },
              "วันที่จ่าย"
            ),
            React.createElement(
              Text,
              { style: styles.cellAmount },
              "จำนวนเงิน"
            ),
            React.createElement(
              Text,
              { style: styles.cellRate },
              "อัตรา%"
            ),
            React.createElement(
              Text,
              { style: styles.cellTax },
              "ภาษีที่หัก"
            )
          ),

          // Table rows
          ...items.map((item, idx) =>
            React.createElement(
              View,
              { style: styles.tableRow, key: String(idx) },
              React.createElement(
                Text,
                { style: styles.cellNo },
                String(idx + 1)
              ),
              React.createElement(
                Text,
                { style: styles.cellType },
                getWhtTypeDescription(item.whtType, item.rdPaymentTypeCode)
              ),
              React.createElement(
                Text,
                { style: styles.cellDate },
                paymentDateDisplay
              ),
              React.createElement(
                Text,
                { style: styles.cellAmount },
                formatAmount(item.baseAmount)
              ),
              React.createElement(
                Text,
                { style: styles.cellRate },
                item.whtRate
                  ? `${(parseFloat(item.whtRate) * 100).toFixed(0)}%`
                  : "-"
              ),
              React.createElement(
                Text,
                { style: styles.cellTax },
                formatAmount(item.whtAmount)
              )
            )
          ),

          // Total row
          React.createElement(
            View,
            { style: styles.totalRow },
            React.createElement(Text, { style: styles.cellNo }, ""),
            React.createElement(
              Text,
              { style: { ...styles.cellType, fontWeight: "bold" } },
              "รวมทั้งสิ้น (Total)"
            ),
            React.createElement(Text, { style: styles.cellDate }, ""),
            React.createElement(
              Text,
              { style: { ...styles.cellAmount, fontWeight: "bold" } },
              formatAmount(data.totalBaseAmount)
            ),
            React.createElement(Text, { style: styles.cellRate }, ""),
            React.createElement(
              Text,
              { style: { ...styles.cellTax, fontWeight: "bold" } },
              formatAmount(data.totalWht)
            )
          )
        )
      ),

      // Section 4: Summary
      React.createElement(
        View,
        { style: styles.summarySection },
        React.createElement(
          View,
          { style: styles.checkboxRow },
          React.createElement(
            Text,
            null,
            "☑ หักภาษี ณ ที่จ่าย     ☐ ออกภาษีให้ตลอดไป     ☐ ออกภาษีให้ครั้งเดียว"
          )
        ),
        React.createElement(
          View,
          { style: styles.row },
          React.createElement(
            Text,
            { style: styles.label },
            "วันที่ออกหนังสือ:"
          ),
          React.createElement(
            Text,
            { style: styles.value },
            `วันที่ ${issuedDateDisplay}`
          )
        )
      ),

      // Signatures
      React.createElement(
        View,
        { style: styles.footer },
        React.createElement(
          View,
          { style: styles.signatureBox },
          React.createElement(
            Text,
            { style: styles.signatureLine },
            "ลงชื่อ ผู้จ่ายเงิน / Payer"
          ),
          React.createElement(
            Text,
            { style: { fontSize: 7, marginTop: 4 } },
            "(.............................................)"
          ),
          React.createElement(
            Text,
            { style: { fontSize: 7 } },
            `วันที่ ${issuedDateDisplay}`
          )
        ),
        React.createElement(
          View,
          { style: styles.signatureBox },
          React.createElement(
            Text,
            { style: styles.signatureLine },
            "ลงชื่อ ผู้รับเงิน / Payee"
          ),
          React.createElement(
            Text,
            { style: { fontSize: 7, marginTop: 4 } },
            "(.............................................)"
          ),
          React.createElement(
            Text,
            { style: { fontSize: 7 } },
            `วันที่ ${issuedDateDisplay}`
          )
        )
      )
    )
  );
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Render a 50 Tawi WHT certificate to a PDF buffer.
 * Suitable for server-side use (server actions, API routes).
 */
export async function renderFiftyTawiPdf(
  data: FiftyTawiData
): Promise<Buffer> {
  const element = createFiftyTawiDocument(data);
  const buffer = await renderToBuffer(element);
  return Buffer.from(buffer);
}
