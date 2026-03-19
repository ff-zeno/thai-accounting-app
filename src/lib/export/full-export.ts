/**
 * Full data export: JSON + CSV for all org data.
 *
 * Exports ALL org data scoped to a single org_id:
 * - documents, document_line_items, vendors, transactions
 * - bank_statements, wht_certificates, wht_certificate_items
 * - payments, vat_records
 *
 * Excludes soft-deleted records (deleted_at IS NULL).
 * Each table produces both a CSV and a JSON file.
 */

import { and, eq, isNull, inArray } from "drizzle-orm";
import { db } from "@/lib/db/index";
import {
  documents,
  documentLineItems,
  vendors,
  transactions,
  bankStatements,
  whtCertificates,
  whtCertificateItems,
  payments,
  vatRecords,
} from "@/lib/db/schema";
import { buildCsv } from "./csv-utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ExportFile {
  filename: string;
  content: string;
  format: "json" | "csv";
}

export interface FullExportResult {
  files: ExportFile[];
}

// ---------------------------------------------------------------------------
// Table export configuration
// ---------------------------------------------------------------------------

interface TableExportConfig {
  name: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  table: any;
  csvHeaders: readonly string[];
  csvKeys: readonly string[];
}

const EXPORT_TABLES: TableExportConfig[] = [
  {
    name: "documents",
    table: documents,
    csvHeaders: [
      "id", "document_number", "type", "direction", "issue_date", "due_date",
      "subtotal", "vat_amount", "total_amount", "currency", "exchange_rate",
      "total_amount_thb", "category", "status", "vat_period_year",
      "vat_period_month", "vendor_id", "related_document_id", "created_at",
    ],
    csvKeys: [
      "id", "documentNumber", "type", "direction", "issueDate", "dueDate",
      "subtotal", "vatAmount", "totalAmount", "currency", "exchangeRate",
      "totalAmountThb", "category", "status", "vatPeriodYear",
      "vatPeriodMonth", "vendorId", "relatedDocumentId", "createdAt",
    ],
  },
  {
    name: "document_line_items",
    table: documentLineItems,
    csvHeaders: [
      "id", "document_id", "description", "quantity", "unit_price", "amount",
      "vat_amount", "wht_rate", "wht_amount", "wht_type",
      "rd_payment_type_code", "account_code",
    ],
    csvKeys: [
      "id", "documentId", "description", "quantity", "unitPrice", "amount",
      "vatAmount", "whtRate", "whtAmount", "whtType",
      "rdPaymentTypeCode", "accountCode",
    ],
  },
  {
    name: "vendors",
    table: vendors,
    csvHeaders: [
      "id", "name", "name_th", "display_alias", "tax_id", "registration_no",
      "branch_number", "address", "address_th", "email",
      "payment_terms_days", "is_vat_registered", "entity_type", "country",
      "created_at",
    ],
    csvKeys: [
      "id", "name", "nameTh", "displayAlias", "taxId", "registrationNo",
      "branchNumber", "address", "addressTh", "email",
      "paymentTermsDays", "isVatRegistered", "entityType", "country",
      "createdAt",
    ],
  },
  {
    name: "transactions",
    table: transactions,
    csvHeaders: [
      "id", "bank_account_id", "statement_id", "date", "description", "amount",
      "type", "running_balance", "reference_no", "channel", "counterparty",
      "reconciliation_status", "is_petty_cash", "external_ref", "created_at",
    ],
    csvKeys: [
      "id", "bankAccountId", "statementId", "date", "description", "amount",
      "type", "runningBalance", "referenceNo", "channel", "counterparty",
      "reconciliationStatus", "isPettyCash", "externalRef", "createdAt",
    ],
  },
  {
    name: "bank_statements",
    table: bankStatements,
    csvHeaders: [
      "id", "bank_account_id", "period_start", "period_end",
      "opening_balance", "closing_balance", "file_url", "parser_used",
      "import_status", "created_at",
    ],
    csvKeys: [
      "id", "bankAccountId", "periodStart", "periodEnd",
      "openingBalance", "closingBalance", "fileUrl", "parserUsed",
      "importStatus", "createdAt",
    ],
  },
  {
    name: "wht_certificates",
    table: whtCertificates,
    csvHeaders: [
      "id", "certificate_no", "payee_vendor_id", "payment_date",
      "total_base_amount", "total_wht", "form_type", "status",
      "issued_date", "voided_at", "void_reason", "pdf_url", "created_at",
    ],
    csvKeys: [
      "id", "certificateNo", "payeeVendorId", "paymentDate",
      "totalBaseAmount", "totalWht", "formType", "status",
      "issuedDate", "voidedAt", "voidReason", "pdfUrl", "createdAt",
    ],
  },
  {
    name: "wht_certificate_items",
    table: whtCertificateItems,
    csvHeaders: [
      "id", "certificate_id", "document_id", "line_item_id",
      "base_amount", "wht_rate", "wht_amount", "rd_payment_type_code",
      "wht_type",
    ],
    csvKeys: [
      "id", "certificateId", "documentId", "lineItemId",
      "baseAmount", "whtRate", "whtAmount", "rdPaymentTypeCode",
      "whtType",
    ],
  },
  {
    name: "payments",
    table: payments,
    csvHeaders: [
      "id", "document_id", "payment_date", "gross_amount",
      "wht_amount_withheld", "net_amount_paid", "payment_method",
      "is_ewht", "notes", "created_at",
    ],
    csvKeys: [
      "id", "documentId", "paymentDate", "grossAmount",
      "whtAmountWithheld", "netAmountPaid", "paymentMethod",
      "isEwht", "notes", "createdAt",
    ],
  },
  {
    name: "vat_records",
    table: vatRecords,
    csvHeaders: [
      "id", "period_year", "period_month", "output_vat", "input_vat_pp30",
      "pp36_reverse_charge", "net_vat_payable", "pp30_status",
      "pp30_deadline", "pp36_status", "pp36_deadline",
      "nil_filing_required", "period_locked", "created_at",
    ],
    csvKeys: [
      "id", "periodYear", "periodMonth", "outputVat", "inputVatPp30",
      "pp36ReverseCharge", "netVatPayable", "pp30Status",
      "pp30Deadline", "pp36Status", "pp36Deadline",
      "nilFilingRequired", "periodLocked", "createdAt",
    ],
  },
];

// ---------------------------------------------------------------------------
// Main export function
// ---------------------------------------------------------------------------

export async function generateFullDataExport(
  orgId: string
): Promise<FullExportResult> {
  const files: ExportFile[] = [];

  // Fetch document IDs first for defense-in-depth on child table exports
  const orgDocs = await db
    .select({ id: documents.id })
    .from(documents)
    .where(and(eq(documents.orgId, orgId), isNull(documents.deletedAt)));
  const docIds = orgDocs.map((d) => d.id);

  for (const config of EXPORT_TABLES) {
    const conditions = [eq(config.table.orgId, orgId)];

    // Add soft-delete filter if the table has deletedAt
    if ("deletedAt" in config.table) {
      conditions.push(isNull(config.table.deletedAt));
    }

    // Defense-in-depth: restrict child tables to known document IDs
    if (
      (config.name === "document_line_items" ||
        config.name === "wht_certificate_items") &&
      "documentId" in config.table
    ) {
      if (docIds.length === 0) {
        // No documents — skip querying child tables entirely
        files.push({
          filename: `${config.name}.json`,
          content: JSON.stringify([], null, 2),
          format: "json",
        });
        files.push({
          filename: `${config.name}.csv`,
          content: buildCsv(config.csvHeaders, []),
          format: "csv",
        });
        continue;
      }
      conditions.push(inArray(config.table.documentId, docIds));
    }

    const rows = await db
      .select()
      .from(config.table)
      .where(and(...conditions));

    // JSON export — plain array of records with camelCase keys
    files.push({
      filename: `${config.name}.json`,
      content: JSON.stringify(rows, null, 2),
      format: "json",
    });

    // CSV export — snake_case headers, camelCase key lookup
    const csvRows: string[][] = rows.map((row: Record<string, unknown>) =>
      config.csvKeys.map((key) => {
        const val = row[key];
        if (val === null || val === undefined) return "";
        if (val instanceof Date) return val.toISOString();
        return String(val);
      })
    );

    files.push({
      filename: `${config.name}.csv`,
      content: buildCsv(config.csvHeaders, csvRows),
      format: "csv",
    });
  }

  return { files };
}
