import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/index";
import {
  whtCertificates,
  whtCertificateItems,
  vendors,
} from "@/lib/db/schema";
import { orgScope } from "@/lib/db/helpers/org-scope";
import { toBuddhistYear } from "@/lib/utils/thai-date";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type PndFormType = "pnd2" | "pnd3" | "pnd53" | "pnd54";

interface CsvRow {
  sequence: number;
  taxId: string;
  branchNumber: string;
  title: string;
  payeeName: string;
  paymentDateBE: string;
  incomeTypeCode: string;
  whtRate: string;
  baseAmount: string;
  whtAmount: string;
  condition: string;
}

// ---------------------------------------------------------------------------
// CSV column headers (Thai, matching RD e-filing format)
// ---------------------------------------------------------------------------

const CSV_HEADERS = [
  "\u0E25\u0E33\u0E14\u0E31\u0E1A",
  "\u0E40\u0E25\u0E02\u0E1B\u0E23\u0E30\u0E08\u0E33\u0E15\u0E31\u0E27\u0E1C\u0E39\u0E49\u0E40\u0E2A\u0E35\u0E22\u0E20\u0E32\u0E29\u0E35",
  "\u0E2A\u0E32\u0E02\u0E32\u0E17\u0E35\u0E48",
  "\u0E04\u0E33\u0E19\u0E33\u0E2B\u0E19\u0E49\u0E32",
  "\u0E0A\u0E37\u0E48\u0E2D-\u0E2A\u0E01\u0E38\u0E25",
  "\u0E27\u0E31\u0E19\u0E17\u0E35\u0E48\u0E08\u0E48\u0E32\u0E22",
  "\u0E1B\u0E23\u0E30\u0E40\u0E20\u0E17\u0E40\u0E07\u0E34\u0E19\u0E44\u0E14\u0E49",
  "\u0E2D\u0E31\u0E15\u0E23\u0E32\u0E20\u0E32\u0E29\u0E35",
  "\u0E08\u0E33\u0E19\u0E27\u0E19\u0E40\u0E07\u0E34\u0E19\u0E17\u0E35\u0E48\u0E08\u0E48\u0E32\u0E22",
  "\u0E20\u0E32\u0E29\u0E35\u0E17\u0E35\u0E48\u0E2B\u0E31\u0E01\u0E44\u0E27\u0E49",
  "\u0E40\u0E07\u0E37\u0E48\u0E2D\u0E19\u0E44\u0E02",
] as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Convert a date string (YYYY-MM-DD) to Buddhist Era format DD/MM/YYYY+543 */
function dateToBuddhistEra(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00+07:00");
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const beYear = toBuddhistYear(d.getFullYear());
  return `${day}/${month}/${beYear}`;
}

/** Format amount for CSV: 2 decimal places, no commas */
function formatAmount(amount: string | null): string {
  if (!amount) return "0.00";
  return parseFloat(amount).toFixed(2);
}

/** Derive the title prefix based on entity type */
function getTitleForEntityType(
  entityType: "individual" | "company" | "foreign"
): string {
  switch (entityType) {
    case "company":
      return "\u0E1A\u0E23\u0E34\u0E29\u0E31\u0E17";
    case "individual":
      return "";
    case "foreign":
      return "";
  }
}

/** WHT rate as percentage string (e.g., "0.0300" -> "3") */
function formatWhtRatePercent(rate: string | null): string {
  if (!rate) return "0";
  const pct = parseFloat(rate) * 100;
  // Avoid trailing zeros: 3.00 -> "3", 2.50 -> "2.5"
  return pct % 1 === 0 ? String(Math.round(pct)) : pct.toFixed(2);
}

/** Escape CSV field — wrap in quotes if it contains commas, quotes, or newlines */
function escapeCsvField(value: string): string {
  if (
    value.includes(",") ||
    value.includes('"') ||
    value.includes("\n") ||
    value.includes("\r")
  ) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

// ---------------------------------------------------------------------------
// Main export function
// ---------------------------------------------------------------------------

/**
 * Generate an RD e-Filing CSV for the given org/month/form type.
 *
 * Returns UTF-8 with BOM for Thai text compatibility with Excel.
 * One row per certificate item (per payee per payment type).
 */
export async function generateRdCsv(
  orgId: string,
  year: number,
  month: number,
  formType: PndFormType
): Promise<{ csv: string; filename: string }> {
  // Fetch all non-voided certificates for the period
  const periodStart = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const periodEnd = `${year}-${String(month).padStart(2, "0")}-${lastDay}`;

  const certificates = await db
    .select({
      certId: whtCertificates.id,
      paymentDate: whtCertificates.paymentDate,
      vendorId: whtCertificates.payeeVendorId,
      status: whtCertificates.status,
    })
    .from(whtCertificates)
    .where(
      and(
        ...orgScope(whtCertificates, orgId),
        eq(whtCertificates.formType, formType),
        sql`${whtCertificates.paymentDate} >= ${periodStart}`,
        sql`${whtCertificates.paymentDate} <= ${periodEnd}`,
        sql`${whtCertificates.status} != 'voided'`
      )
    )
    .orderBy(sql`${whtCertificates.paymentDate} ASC`);

  if (certificates.length === 0) {
    const beYear = toBuddhistYear(year);
    const monthStr = String(month).padStart(2, "0");
    const filename = `${formType.toUpperCase()}_${beYear}_${monthStr}.csv`;
    // Return empty CSV with headers only
    const csv = "\uFEFF" + CSV_HEADERS.map(escapeCsvField).join(",") + "\r\n";
    return { csv, filename };
  }

  // Collect all vendor IDs and fetch vendor data
  const vendorIds = [...new Set(certificates.map((c) => c.vendorId))];
  const vendorRows = await db
    .select({
      id: vendors.id,
      name: vendors.name,
      nameTh: vendors.nameTh,
      taxId: vendors.taxId,
      branchNumber: vendors.branchNumber,
      entityType: vendors.entityType,
    })
    .from(vendors)
    .where(
      and(
        ...orgScope(vendors, orgId),
        sql`${vendors.id} IN ${vendorIds}`
      )
    );

  const vendorMap = new Map(vendorRows.map((v) => [v.id, v]));

  // Fetch all certificate items for these certificates
  const certIds = certificates.map((c) => c.certId);
  const items = await db
    .select({
      certificateId: whtCertificateItems.certificateId,
      baseAmount: whtCertificateItems.baseAmount,
      whtRate: whtCertificateItems.whtRate,
      whtAmount: whtCertificateItems.whtAmount,
      rdPaymentTypeCode: whtCertificateItems.rdPaymentTypeCode,
    })
    .from(whtCertificateItems)
    .where(
      and(
        ...orgScope(whtCertificateItems, orgId),
        sql`${whtCertificateItems.certificateId} IN ${certIds}`
      )
    );

  // Group items by certificate
  const itemsByCert = new Map<string, typeof items>();
  for (const item of items) {
    const existing = itemsByCert.get(item.certificateId) ?? [];
    existing.push(item);
    itemsByCert.set(item.certificateId, existing);
  }

  // Build CSV rows
  const csvRows: CsvRow[] = [];
  let sequence = 0;

  for (const cert of certificates) {
    const vendor = vendorMap.get(cert.vendorId);
    if (!vendor) continue;

    const certItems = itemsByCert.get(cert.certId) ?? [];
    if (certItems.length === 0) continue;

    for (const item of certItems) {
      sequence++;
      csvRows.push({
        sequence,
        taxId: vendor.taxId ?? "",
        branchNumber: vendor.branchNumber ?? "00000",
        title: getTitleForEntityType(vendor.entityType),
        payeeName: vendor.nameTh ?? vendor.name,
        paymentDateBE: dateToBuddhistEra(cert.paymentDate ?? ""),
        incomeTypeCode: item.rdPaymentTypeCode ?? "",
        whtRate: formatWhtRatePercent(item.whtRate),
        baseAmount: formatAmount(item.baseAmount),
        whtAmount: formatAmount(item.whtAmount),
        condition: "1",
      });
    }
  }

  // Build CSV string
  const headerLine = CSV_HEADERS.map(escapeCsvField).join(",");
  const dataLines = csvRows.map((row) =>
    [
      String(row.sequence),
      escapeCsvField(row.taxId),
      escapeCsvField(row.branchNumber),
      escapeCsvField(row.title),
      escapeCsvField(row.payeeName),
      escapeCsvField(row.paymentDateBE),
      escapeCsvField(row.incomeTypeCode),
      escapeCsvField(row.whtRate),
      escapeCsvField(row.baseAmount),
      escapeCsvField(row.whtAmount),
      escapeCsvField(row.condition),
    ].join(",")
  );

  // UTF-8 BOM + header + data rows, CRLF line endings
  const csv = "\uFEFF" + [headerLine, ...dataLines].join("\r\n") + "\r\n";

  const beYear = toBuddhistYear(year);
  const monthStr = String(month).padStart(2, "0");
  const filename = `${formType.toUpperCase()}_${beYear}_${monthStr}.csv`;

  return { csv, filename };
}
