"use client";

import { ImageViewer } from "./image-viewer";
import { ExtractionForm } from "./extraction-form";
import { TranslationOverlay } from "./translation-overlay";

interface DocumentReviewProps {
  document: {
    id: string;
    type: string;
    documentNumber: string | null;
    issueDate: string | null;
    dueDate: string | null;
    subtotal: string | null;
    vatAmount: string | null;
    totalAmount: string | null;
    currency: string | null;
    status: string;
    needsReview: boolean | null;
    aiConfidence: string | null;
    reviewNotes: string | null;
    detectedLanguage: string | null;
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
  } | null;
}

export function DocumentReview({
  document: doc,
  files,
  lineItems,
  vendor,
}: DocumentReviewProps) {
  return (
    <div className="flex h-[calc(100vh-8rem)] gap-0 overflow-hidden rounded-lg border">
      {/* Left panel: Image viewer */}
      <div className="w-1/2 border-r">
        <ImageViewer files={files} />
      </div>

      {/* Right panel: Extracted data */}
      <div className="flex w-1/2 flex-col overflow-hidden">
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
