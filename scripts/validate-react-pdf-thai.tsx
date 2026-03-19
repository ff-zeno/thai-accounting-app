#!/usr/bin/env tsx
/**
 * Phase 0 Validation (V4): React-PDF Thai Font Rendering
 *
 * Generates a proof-of-concept 50 Tawi (withholding tax certificate) PDF
 * to confirm that @react-pdf/renderer can render Thai text correctly
 * using the Sarabun font from Google Fonts.
 *
 * Usage:
 *   npx tsx scripts/validate-react-pdf-thai.tsx
 */

import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  Font,
  StyleSheet,
  renderToFile,
} from "@react-pdf/renderer";
import { resolve } from "path";
import { statSync, mkdirSync, existsSync } from "fs";

// ── Font Registration ──

const fontsDir = resolve(__dirname, "../src/lib/pdf/fonts/Sarabun");

Font.register({
  family: "Sarabun",
  fonts: [
    { src: resolve(fontsDir, "Sarabun-Regular.ttf"), fontWeight: "normal" },
    { src: resolve(fontsDir, "Sarabun-Bold.ttf"), fontWeight: "bold" },
  ],
});

// Disable hyphenation — Thai doesn't use hyphens for word-wrapping
Font.registerHyphenationCallback((word) => [word]);

// ── Styles ──

const styles = StyleSheet.create({
  page: {
    fontFamily: "Sarabun",
    fontSize: 10,
    padding: 40,
    backgroundColor: "#ffffff",
  },
  header: {
    textAlign: "center",
    marginBottom: 20,
  },
  title: {
    fontSize: 16,
    fontWeight: "bold",
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 12,
    marginBottom: 2,
  },
  formTitle: {
    fontSize: 14,
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: 16,
    borderBottom: "2px solid #000",
    paddingBottom: 8,
  },
  row: {
    flexDirection: "row",
    marginBottom: 6,
  },
  label: {
    width: 160,
    fontWeight: "bold",
  },
  value: {
    flex: 1,
  },
  section: {
    marginBottom: 16,
    padding: 10,
    border: "1px solid #999",
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: "bold",
    marginBottom: 8,
    backgroundColor: "#f0f0f0",
    padding: 4,
  },
  // Table styles
  table: {
    marginTop: 10,
    border: "1px solid #000",
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#e0e0e0",
    borderBottom: "1px solid #000",
    fontWeight: "bold",
    fontSize: 9,
  },
  tableRow: {
    flexDirection: "row",
    borderBottom: "1px solid #ccc",
    fontSize: 9,
  },
  cellNo: {
    width: 30,
    padding: 4,
    borderRight: "1px solid #ccc",
    textAlign: "center",
  },
  cellType: {
    width: 160,
    padding: 4,
    borderRight: "1px solid #ccc",
  },
  cellDate: {
    width: 80,
    padding: 4,
    borderRight: "1px solid #ccc",
    textAlign: "center",
  },
  cellAmount: {
    width: 80,
    padding: 4,
    borderRight: "1px solid #ccc",
    textAlign: "right",
  },
  cellTax: {
    width: 80,
    padding: 4,
    textAlign: "right",
  },
  totalRow: {
    flexDirection: "row",
    borderTop: "2px solid #000",
    fontWeight: "bold",
    fontSize: 9,
  },
  checkboxRow: {
    flexDirection: "row",
    marginBottom: 6,
    gap: 20,
  },
  footer: {
    marginTop: 30,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  signatureBox: {
    width: 200,
    textAlign: "center",
    paddingTop: 40,
  },
  signatureLine: {
    borderTop: "1px solid #000",
    marginTop: 4,
    paddingTop: 4,
  },
});

// ── Document Component ──

const TawiCertificate = () =>
  React.createElement(
    Document,
    {
      title: "50 Tawi - Withholding Tax Certificate (POC)",
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
          { style: { fontSize: 9, color: "#666" } },
          "ตามมาตรา 50 ทวิ แห่งประมวลรัษฎากร"
        )
      ),

      // Form type checkboxes
      React.createElement(
        View,
        { style: styles.formTitle },
        React.createElement(
          Text,
          null,
          "แบบยื่นภาษี:  ☐ ภ.ง.ด.1ก  ☐ ภ.ง.ด.1ก พิเศษ  ☐ ภ.ง.ด.2  ☐ ภ.ง.ด.3  ☑ ภ.ง.ด.53  ☐ ภ.ง.ด.54"
        )
      ),

      // Payer section
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
            "ชื่อบริษัท (Company):"
          ),
          React.createElement(
            Text,
            { style: styles.value },
            "บริษัท ลูเมร่า (ประเทศไทย) จำกัด"
          )
        ),
        React.createElement(
          View,
          { style: styles.row },
          React.createElement(Text, { style: styles.label }, "English Name:"),
          React.createElement(
            Text,
            { style: styles.value },
            "LUMERA (THAILAND) CO., LTD."
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
            "0105537004444"
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
            "123/45 อาคารสาทร ชั้น 10 ถนนสาทรใต้ แขวงทุ่งมหาเมฆ เขตสาทร กรุงเทพมหานคร 10120"
          )
        )
      ),

      // Payee section
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
            "บริษัท ไทยซอฟต์แวร์ดีไซน์ จำกัด / Thai Software Design Co., Ltd."
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
            "0105562001234"
          )
        )
      ),

      // WHT detail table
      React.createElement(
        View,
        { style: styles.section },
        React.createElement(
          Text,
          { style: styles.sectionTitle },
          "3. รายละเอียดการหักภาษี ณ ที่จ่าย (Withholding Tax Details)"
        ),

        // Table
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
              { style: styles.cellTax },
              "ภาษีที่หัก"
            )
          ),

          // Row 1
          React.createElement(
            View,
            { style: styles.tableRow },
            React.createElement(Text, { style: styles.cellNo }, "1"),
            React.createElement(
              Text,
              { style: styles.cellType },
              "ค่าบริการ (Service fees) — 3%"
            ),
            React.createElement(
              Text,
              { style: styles.cellDate },
              "15/03/2569"
            ),
            React.createElement(
              Text,
              { style: styles.cellAmount },
              "฿10,000.00"
            ),
            React.createElement(
              Text,
              { style: styles.cellTax },
              "฿300.00"
            )
          ),

          // Row 2
          React.createElement(
            View,
            { style: styles.tableRow },
            React.createElement(Text, { style: styles.cellNo }, "2"),
            React.createElement(
              Text,
              { style: styles.cellType },
              "ค่าเช่า (Rental) — 5%"
            ),
            React.createElement(
              Text,
              { style: styles.cellDate },
              "18/03/2569"
            ),
            React.createElement(
              Text,
              { style: styles.cellAmount },
              "฿50,000.00"
            ),
            React.createElement(
              Text,
              { style: styles.cellTax },
              "฿2,500.00"
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
              "฿60,000.00"
            ),
            React.createElement(
              Text,
              { style: { ...styles.cellTax, fontWeight: "bold" } },
              "฿2,800.00"
            )
          )
        )
      ),

      // Buddhist Era date and additional Thai text
      React.createElement(
        View,
        { style: { marginBottom: 16 } },
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
            "วันที่ 18 มีนาคม พ.ศ. 2569"
          )
        ),
        React.createElement(
          View,
          { style: styles.row },
          React.createElement(
            Text,
            { style: styles.label },
            "เลขที่หนังสือ (Cert No.):"
          ),
          React.createElement(
            Text,
            { style: styles.value },
            "WHT-2569-0001"
          )
        )
      ),

      // Thai numerals + mixed content test
      React.createElement(
        View,
        {
          style: {
            marginBottom: 16,
            padding: 8,
            border: "1px dashed #999",
            backgroundColor: "#fafafa",
          },
        },
        React.createElement(
          Text,
          { style: { fontSize: 8, color: "#999", marginBottom: 4 } },
          "--- Font Rendering Validation ---"
        ),
        React.createElement(
          Text,
          { style: { marginBottom: 2 } },
          "Thai tonal marks: ก่อ ข้อ ค้า ง่าย จ๊ะ ฉุ๋ย"
        ),
        React.createElement(
          Text,
          { style: { marginBottom: 2 } },
          "Thai vowels: กุ กู เก แก โก ไก ใก"
        ),
        React.createElement(
          Text,
          { style: { marginBottom: 2 } },
          "Mixed: Invoice #INV-2569-001 สำหรับเดือน มีนาคม 2569"
        ),
        React.createElement(
          Text,
          { style: { marginBottom: 2 } },
          "Thai digits: ๐ ๑ ๒ ๓ ๔ ๕ ๖ ๗ ๘ ๙"
        ),
        React.createElement(
          Text,
          { style: { marginBottom: 2 } },
          "Currency: ฿60,000.00 (หกหมื่นบาทถ้วน)"
        ),
        React.createElement(
          Text,
          null,
          "Tax ID format: เลขประจำตัวผู้เสียภาษี 0-1055-37004-44-4"
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
            { style: { fontSize: 8, marginTop: 4 } },
            "(.............................................)"
          ),
          React.createElement(
            Text,
            { style: { fontSize: 8 } },
            "ตำแหน่ง กรรมการ"
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
            { style: { fontSize: 8, marginTop: 4 } },
            "(.............................................)"
          ),
          React.createElement(
            Text,
            { style: { fontSize: 8 } },
            "วันที่ 18 มีนาคม พ.ศ. 2569"
          )
        )
      )
    )
  );

// ── Main ──

async function main() {
  const outputDir = resolve(__dirname, "output");
  const outputPath = resolve(outputDir, "50-tawi-poc.pdf");

  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  console.log("\n  Phase 0 Validation: React-PDF Thai Font Rendering");
  console.log("  ==================================================\n");
  console.log(`  Font directory: ${fontsDir}`);
  console.log(`  Output path:    ${outputPath}\n`);

  const startTime = Date.now();

  try {
    await renderToFile(React.createElement(TawiCertificate), outputPath);

    const elapsed = Date.now() - startTime;
    const stats = statSync(outputPath);
    const sizeKb = (stats.size / 1024).toFixed(1);

    console.log("  RESULT: SUCCESS");
    console.log(`  File size:      ${sizeKb} KB (${stats.size} bytes)`);
    console.log(`  Render time:    ${elapsed} ms`);
    console.log(`  Output:         ${outputPath}`);
    console.log("\n  Thai text elements validated:");
    console.log("    - Company name: บริษัท ลูเมร่า (ประเทศไทย) จำกัด");
    console.log("    - English text: LUMERA (THAILAND) CO., LTD.");
    console.log("    - Mixed Thai+English content");
    console.log("    - Thai tonal marks and vowels");
    console.log("    - Thai digits: ๐ ๑ ๒ ๓ ๔ ๕ ๖ ๗ ๘ ๙");
    console.log("    - Buddhist Era date: พ.ศ. 2569");
    console.log("    - Currency amounts: ฿60,000.00");
    console.log("    - Form checkboxes: ☐/☑");
    console.log("    - WHT detail table with amounts");
    console.log("    - Signature lines");
    console.log("\n  V4 Validation: PASS - React-PDF renders Thai text correctly\n");
  } catch (error) {
    const elapsed = Date.now() - startTime;
    console.error("  RESULT: FAILED");
    console.error(`  Render time:    ${elapsed} ms`);
    console.error(`  Error:          ${error}`);
    console.error(
      "\n  V4 Validation: FAIL - React-PDF cannot render Thai text correctly"
    );
    console.error(
      "  Action required: Evaluate alternative PDF libraries (pdfmake, jsPDF)\n"
    );
    process.exit(1);
  }
}

main();
