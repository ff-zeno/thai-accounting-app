import { and, eq, sql } from "drizzle-orm";
import { db } from "../db/index";
import { documents, vendors } from "../db/schema";
import { orgScope } from "../db/helpers/org-scope";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface VatRegisterData {
  inputRegister: Array<{
    date: string;
    documentNumber: string;
    vendorName: string;
    vendorTaxId: string;
    baseAmount: string;
    vatAmount: string;
    isCreditNote: boolean;
  }>;
  outputRegister: Array<{
    date: string;
    documentNumber: string;
    customerName: string;
    customerTaxId: string;
    baseAmount: string;
    vatAmount: string;
    isCreditNote: boolean;
  }>;
  inputTotal: string;
  outputTotal: string;
}

// ---------------------------------------------------------------------------
// Generate VAT register data for a period
// ---------------------------------------------------------------------------

export async function generateVatRegister(
  orgId: string,
  year: number,
  month: number
): Promise<VatRegisterData> {
  // Input register: expense documents from domestic VAT-registered vendors
  const inputDocs = await db
    .select({
      issueDate: documents.issueDate,
      documentNumber: documents.documentNumber,
      subtotal: documents.subtotal,
      vatAmount: documents.vatAmount,
      type: documents.type,
      vendorName: vendors.name,
      vendorTaxId: vendors.taxId,
    })
    .from(documents)
    .innerJoin(vendors, eq(documents.vendorId, vendors.id))
    .where(
      and(
        ...orgScope(documents, orgId),
        eq(documents.direction, "expense"),
        eq(documents.status, "confirmed"),
        eq(documents.vatPeriodYear, year),
        eq(documents.vatPeriodMonth, month),
        sql`${documents.taxInvoiceSubtype} IN ('full_ti', 'e_tax_invoice')`,
        eq(vendors.isVatRegistered, true),
        sql`${vendors.entityType} != 'foreign'`,
        sql`COALESCE(${vendors.country}, 'TH') = 'TH'`
      )
    )
    .orderBy(documents.issueDate);

  // Output register: income documents
  const outputDocs = await db
    .select({
      issueDate: documents.issueDate,
      documentNumber: documents.documentNumber,
      subtotal: documents.subtotal,
      vatAmount: documents.vatAmount,
      type: documents.type,
      vendorName: vendors.name,
      vendorTaxId: vendors.taxId,
    })
    .from(documents)
    .leftJoin(vendors, eq(documents.vendorId, vendors.id))
    .where(
      and(
        ...orgScope(documents, orgId),
        eq(documents.direction, "income"),
        eq(documents.status, "confirmed"),
        eq(documents.vatPeriodYear, year),
        eq(documents.vatPeriodMonth, month)
      )
    )
    .orderBy(documents.issueDate);

  const inputRegister = inputDocs.map((doc) => {
    const isCreditNote = doc.type === "credit_note";
    return {
      date: doc.issueDate ?? "",
      documentNumber: doc.documentNumber ?? "",
      vendorName: doc.vendorName ?? "",
      vendorTaxId: doc.vendorTaxId ?? "",
      baseAmount: isCreditNote
        ? `-${doc.subtotal ?? "0.00"}`
        : (doc.subtotal ?? "0.00"),
      vatAmount: isCreditNote
        ? `-${doc.vatAmount ?? "0.00"}`
        : (doc.vatAmount ?? "0.00"),
      isCreditNote,
    };
  });

  const outputRegister = outputDocs.map((doc) => {
    const isCreditNote = doc.type === "credit_note";
    return {
      date: doc.issueDate ?? "",
      documentNumber: doc.documentNumber ?? "",
      customerName: doc.vendorName ?? "",
      customerTaxId: doc.vendorTaxId ?? "",
      baseAmount: isCreditNote
        ? `-${doc.subtotal ?? "0.00"}`
        : (doc.subtotal ?? "0.00"),
      vatAmount: isCreditNote
        ? `-${doc.vatAmount ?? "0.00"}`
        : (doc.vatAmount ?? "0.00"),
      isCreditNote,
    };
  });

  // Calculate totals (credit notes subtract)
  let inputTotal = 0;
  for (const entry of inputRegister) {
    inputTotal += parseFloat(entry.vatAmount);
  }

  let outputTotal = 0;
  for (const entry of outputRegister) {
    outputTotal += parseFloat(entry.vatAmount);
  }

  return {
    inputRegister,
    outputRegister,
    inputTotal: inputTotal.toFixed(2),
    outputTotal: outputTotal.toFixed(2),
  };
}
