"use client";

import { ImageViewer } from "./image-viewer";
import { ExtractionForm } from "./extraction-form";
import { TranslationOverlay } from "./translation-overlay";

interface DocumentReviewProps {
  document: {
    id: string;
    direction: "expense" | "income";
    type: string;
    documentNumber: string | null;
    issueDate: string | null;
    dueDate: string | null;
    subtotal: string | null;
    vatAmount: string | null;
    totalAmount: string | null;
    currency: string | null;
    exchangeRate: string | null;
    totalAmountThb: string | null;
    category: string | null;
    taxInvoiceSubtype: "full_ti" | "abb" | "e_tax_invoice" | "not_a_ti" | null;
    supplierTaxIdSnapshot: string | null;
    supplierBranchNumberSnapshot: string | null;
    buyerTaxIdSnapshot: string | null;
    buyerBranchNumberSnapshot: string | null;
    taxInvoiceSerialNumber: string | null;
    taxInvoiceWords: string | null;
    isPp36Subject: boolean | null;
    status: string;
    needsReview: boolean | null;
    aiConfidence: string | null;
    reviewNotes: string | null;
    detectedLanguage: string | null;
    updatedAt: string | null;
  };
  files: Array<{
    id: string;
    fileUrl: string;
    pageNumber: number | null;
    originalFilename: string | null;
  }>;
  lineItems: Array<{
    id: string;
    description: string | null;
    quantity: string | null;
    unitPrice: string | null;
    amount: string | null;
    vatAmount: string | null;
    whtType: string | null;
  }>;
  vendor: {
    id: string;
    name: string;
    nameTh: string | null;
    displayAlias: string | null;
    taxId: string | null;
    entityType: string | null;
    country: string | null;
  } | null;
}

export function DocumentReview({
  document: doc,
  files,
  lineItems,
  vendor,
}: DocumentReviewProps) {
  return (
    <div className="flex flex-col gap-0 overflow-hidden rounded-lg border lg:h-[calc(100vh-8rem)] lg:flex-row">
      {/* Left panel: Image viewer */}
      <div className="w-full border-r lg:w-1/2">
        <ImageViewer files={files} />
      </div>

      {/* Right panel: Extracted data */}
      <div className="flex w-full flex-col overflow-hidden lg:w-1/2">
        <ExtractionForm
          document={doc}
          vendor={vendor}
          lineItems={lineItems}
        />
        <div className="border-t p-4">
          <TranslationOverlay
            vendorName={vendor?.nameTh || vendor?.name}
            lineDescriptions={lineItems
              .map((li) => li.description)
              .filter((d): d is string => !!d)}
            detectedLanguage={doc.detectedLanguage}
          />
        </div>
      </div>
    </div>
  );
}
