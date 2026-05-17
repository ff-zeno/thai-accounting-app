/**
 * Bilingual 50 Tawi WHT Certificate PDF Generator.
 *
 * This keeps the existing 50 Tawi structure but renders Thai and English
 * labels side by side for foreign payees.
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
  formatThaiDate,
  formatThaiDateShort,
  toBuddhistYear,
} from "@/lib/utils/thai-date";
import type { FiftyTawiData, FiftyTawiItem } from "./fifty-tawi";

export function shouldRenderBilingualFiftyTawiPayee(payee: {
  entityType?: string | null;
  country?: string | null;
}) {
  return (
    payee.entityType === "foreign" ||
    (payee.country ? payee.country.toUpperCase() !== "TH" : false)
  );
}

const fontsDir = resolve(process.cwd(), "src/lib/pdf/fonts/Sarabun");

Font.register({
  family: "Sarabun",
  fonts: [
    { src: resolve(fontsDir, "Sarabun-Regular.ttf"), fontWeight: "normal" },
    { src: resolve(fontsDir, "Sarabun-Bold.ttf"), fontWeight: "bold" },
  ],
});

Font.registerHyphenationCallback((word) => [word]);

function formatAmount(value: string | null): string {
  if (!value) return "0.00";
  const num = Number(value);
  if (Number.isNaN(num)) return "0.00";
  return num.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatBranchThai(branchNumber: string | null | undefined): string {
  if (!branchNumber || branchNumber === "00000") return "สำนักงานใหญ่";
  return branchNumber;
}

function formatBranchEnglish(branchNumber: string | null | undefined): string {
  if (!branchNumber || branchNumber === "00000") return "Head office";
  return `Branch ${branchNumber}`;
}

function formatCertNoDisplay(certNo: string): string {
  const parts = certNo.split("/");
  if (parts.length === 3) {
    const yearNum = Number(parts[1]);
    if (!Number.isNaN(yearNum)) {
      parts[1] = String(toBuddhistYear(yearNum));
    }
  }
  return parts.join("/");
}

function formTypeCheckbox(formType: string, targetType: string): string {
  return formType === targetType ? "☑" : "☐";
}

const WHT_TYPE_DESCRIPTIONS: Record<string, { th: string; en: string }> = {
  "40(1)": { th: "เงินเดือน ค่าจ้าง", en: "Salary and wages" },
  "40(2)": { th: "ค่านายหน้า", en: "Commission" },
  "40(3)": { th: "ค่าลิขสิทธิ์", en: "Royalty" },
  "40(4)(a)": { th: "ดอกเบี้ย", en: "Interest" },
  "40(4)(b)": { th: "เงินปันผล", en: "Dividend" },
  "40(5)": { th: "ค่าเช่าทรัพย์สิน", en: "Rental" },
  "40(6)": { th: "ค่าวิชาชีพอิสระ", en: "Professional fees" },
  "40(7)": { th: "ค่ารับเหมา", en: "Contractor fees" },
  "40(8)": { th: "ค่าบริการ/อื่นๆ", en: "Service fees / Others" },
};

function itemDescription(item: FiftyTawiItem, language: "th" | "en") {
  const mapped = item.rdPaymentTypeCode
    ? WHT_TYPE_DESCRIPTIONS[item.rdPaymentTypeCode]
    : null;
  if (mapped) return mapped[language];
  if (item.whtType) return item.whtType;
  return language === "th" ? "อื่นๆ" : "Others";
}

const styles = StyleSheet.create({
  page: {
    fontFamily: "Sarabun",
    fontSize: 8,
    padding: 28,
    backgroundColor: "#fff",
  },
  english: {
    fontFamily: "Helvetica",
  },
  header: {
    textAlign: "center",
    marginBottom: 10,
  },
  title: {
    fontSize: 13,
    fontWeight: "bold",
  },
  subtitle: {
    fontFamily: "Helvetica",
    fontSize: 9,
    marginTop: 2,
  },
  certNoRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginBottom: 8,
  },
  formTypeRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 12,
    marginBottom: 9,
  },
  section: {
    border: "1px solid #999",
    marginBottom: 8,
    padding: 6,
  },
  sectionTitle: {
    backgroundColor: "#f0f0f0",
    fontWeight: "bold",
    padding: 3,
    marginBottom: 5,
  },
  bilingualRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 4,
  },
  column: {
    flex: 1,
  },
  label: {
    fontWeight: "bold",
  },
  table: {
    border: "1px solid #000",
    marginTop: 5,
  },
  tableRow: {
    flexDirection: "row",
    borderBottom: "1px solid #ccc",
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#e8e8e8",
    borderBottom: "1px solid #000",
    fontWeight: "bold",
  },
  totalRow: {
    flexDirection: "row",
    borderTop: "2px solid #000",
    fontWeight: "bold",
  },
  cellNo: {
    width: 24,
    padding: 3,
    borderRight: "1px solid #ccc",
    textAlign: "center",
  },
  cellType: {
    width: 210,
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
    width: 75,
    padding: 3,
    borderRight: "1px solid #ccc",
    textAlign: "right",
  },
  cellRate: {
    width: 42,
    padding: 3,
    borderRight: "1px solid #ccc",
    textAlign: "center",
  },
  cellTax: {
    width: 75,
    padding: 3,
    textAlign: "right",
  },
  footer: {
    marginTop: 18,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  signatureBox: {
    width: 190,
    textAlign: "center",
    paddingTop: 30,
  },
  signatureLine: {
    borderTop: "1px solid #000",
    paddingTop: 4,
  },
});

function bilingualRow(thLabel: string, thValue: string, enLabel: string, enValue: string) {
  return React.createElement(
    View,
    { style: styles.bilingualRow },
    React.createElement(
      View,
      { style: styles.column },
      React.createElement(Text, { style: styles.label }, thLabel),
      React.createElement(Text, null, thValue || "-")
    ),
    React.createElement(
      View,
      { style: [styles.column, styles.english] },
      React.createElement(Text, { style: styles.label }, enLabel),
      React.createElement(Text, null, enValue || "-")
    )
  );
}

function createFiftyTawiBilingualDocument(data: FiftyTawiData) {
  const { payer, payee, items } = data;
  const paymentDateThai = data.paymentDate ? formatThaiDateShort(data.paymentDate) : "-";
  const paymentDateEn = data.paymentDate ?? "-";
  const issuedDateThai = data.issuedDate
    ? formatThaiDate(data.issuedDate)
    : data.paymentDate
      ? formatThaiDate(data.paymentDate)
      : "-";
  const issuedDateEn = data.issuedDate ?? data.paymentDate ?? "-";

  return React.createElement(
    Document,
    {
      title: `50 Tawi Bilingual - ${data.certificateNo}`,
      author: "Thai Accounting App",
    },
    React.createElement(
      Page,
      { size: "A4", style: styles.page },
      React.createElement(
        View,
        { style: styles.header },
        React.createElement(Text, { style: styles.title }, "หนังสือรับรองการหักภาษี ณ ที่จ่าย"),
        React.createElement(Text, { style: styles.subtitle }, "Withholding Tax Certificate"),
        React.createElement(Text, null, "ตามมาตรา 50 ทวิ แห่งประมวลรัษฎากร / Issued under Section 50 Bis of the Revenue Code")
      ),
      React.createElement(
        View,
        { style: styles.certNoRow },
        React.createElement(Text, { style: styles.label }, `เลขที่ / No.: ${formatCertNoDisplay(data.certificateNo)}`)
      ),
      data.replacesCertificateNo
        ? React.createElement(
            Text,
            { style: { marginBottom: 6, textAlign: "right" } },
            `Replaces ${formatCertNoDisplay(data.replacesCertificateNo)}`
          )
        : null,
      React.createElement(
        View,
        { style: styles.formTypeRow },
        React.createElement(Text, null, `${formTypeCheckbox(data.formType, "pnd2")} ภ.ง.ด.2 / PND 2`),
        React.createElement(Text, null, `${formTypeCheckbox(data.formType, "pnd3")} ภ.ง.ด.3 / PND 3`),
        React.createElement(Text, null, `${formTypeCheckbox(data.formType, "pnd53")} ภ.ง.ด.53 / PND 53`),
        React.createElement(Text, null, `${formTypeCheckbox(data.formType, "pnd54")} ภ.ง.ด.54 / PND 54`)
      ),
      React.createElement(
        View,
        { style: styles.section },
        React.createElement(Text, { style: styles.sectionTitle }, "1. ผู้มีหน้าที่หักภาษี ณ ที่จ่าย / Payer"),
        bilingualRow("ชื่อ", [payer.nameTh, payer.name].filter(Boolean).join(" / "), "Name", payer.name),
        bilingualRow("เลขประจำตัวผู้เสียภาษี", payer.taxId, "Tax ID", payer.taxId),
        bilingualRow("สาขา", formatBranchThai(payer.branchNumber), "Branch", formatBranchEnglish(payer.branchNumber)),
        bilingualRow("ที่อยู่", payer.addressTh || payer.address || "-", "Address", payer.address || payer.addressTh || "-")
      ),
      React.createElement(
        View,
        { style: styles.section },
        React.createElement(Text, { style: styles.sectionTitle }, "2. ผู้ถูกหักภาษี ณ ที่จ่าย / Payee"),
        bilingualRow("ชื่อ", [payee.nameTh, payee.name].filter(Boolean).join(" / "), "Name", payee.name),
        bilingualRow("เลขประจำตัวผู้เสียภาษี", payee.taxId || "-", "Tax ID / Passport", payee.taxId || "-"),
        bilingualRow("สาขา", formatBranchThai(payee.branchNumber), "Branch", formatBranchEnglish(payee.branchNumber)),
        bilingualRow("ที่อยู่", payee.addressTh || payee.address || "-", "Address", payee.address || payee.addressTh || "-")
      ),
      React.createElement(
        View,
        { style: styles.section },
        React.createElement(Text, { style: styles.sectionTitle }, "3. รายละเอียดการหักภาษี ณ ที่จ่าย / Withholding Tax Details"),
        React.createElement(
          View,
          { style: styles.table },
          React.createElement(
            View,
            { style: styles.tableHeader },
            React.createElement(Text, { style: styles.cellNo }, "#"),
            React.createElement(Text, { style: styles.cellType }, "ประเภทเงินได้ / Income type"),
            React.createElement(Text, { style: styles.cellDate }, "วันที่ / Date"),
            React.createElement(Text, { style: styles.cellAmount }, "เงินได้ / Income"),
            React.createElement(Text, { style: styles.cellRate }, "Rate"),
            React.createElement(Text, { style: styles.cellTax }, "Tax")
          ),
          ...items.map((item, index) =>
            React.createElement(
              View,
              { style: styles.tableRow, key: String(index) },
              React.createElement(Text, { style: styles.cellNo }, String(index + 1)),
              React.createElement(
                Text,
                { style: styles.cellType },
                `${itemDescription(item, "th")} / ${itemDescription(item, "en")}`
              ),
              React.createElement(Text, { style: styles.cellDate }, `${paymentDateThai}\n${paymentDateEn}`),
              React.createElement(Text, { style: styles.cellAmount }, formatAmount(item.baseAmount)),
              React.createElement(
                Text,
                { style: styles.cellRate },
                item.whtRate ? `${(Number(item.whtRate) * 100).toFixed(0)}%` : "-"
              ),
              React.createElement(Text, { style: styles.cellTax }, formatAmount(item.whtAmount))
            )
          ),
          React.createElement(
            View,
            { style: styles.totalRow },
            React.createElement(Text, { style: styles.cellNo }, ""),
            React.createElement(Text, { style: styles.cellType }, "รวมทั้งสิ้น / Total"),
            React.createElement(Text, { style: styles.cellDate }, ""),
            React.createElement(Text, { style: styles.cellAmount }, formatAmount(data.totalBaseAmount)),
            React.createElement(Text, { style: styles.cellRate }, ""),
            React.createElement(Text, { style: styles.cellTax }, formatAmount(data.totalWht))
          )
        )
      ),
      React.createElement(
        View,
        { style: styles.section },
        bilingualRow(
          "ประเภทการออกหนังสือ",
          "หักภาษี ณ ที่จ่าย",
          "Certificate type",
          "Tax withheld at source"
        ),
        bilingualRow("วันที่ออกหนังสือ", issuedDateThai, "Issued date", issuedDateEn)
      ),
      React.createElement(
        View,
        { style: styles.footer },
        React.createElement(
          View,
          { style: styles.signatureBox },
          React.createElement(Text, { style: styles.signatureLine }, "ลงชื่อ ผู้จ่ายเงิน / Payer"),
          React.createElement(Text, null, "(.............................................)")
        ),
        React.createElement(
          View,
          { style: styles.signatureBox },
          React.createElement(Text, { style: styles.signatureLine }, "ลงชื่อ ผู้รับเงิน / Payee"),
          React.createElement(Text, null, "(.............................................)")
        )
      )
    )
  );
}

export async function renderFiftyTawiBilingualPdf(
  data: FiftyTawiData
): Promise<Buffer> {
  const buffer = await renderToBuffer(createFiftyTawiBilingualDocument(data));
  return Buffer.from(buffer);
}
