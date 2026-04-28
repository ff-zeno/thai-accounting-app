import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getActiveOrgId } from "@/lib/utils/org-context";
import { getDocumentWithDetails } from "@/lib/db/queries/documents";
import { getMatchesByDocumentId } from "@/lib/db/queries/reconciliation";
import { getLatestExtractionLog } from "@/lib/db/queries/extraction-log";
import { DocumentReview } from "./document-review";
import { MatchedTransactions } from "./matched-transactions";
import { LearningIndicator } from "./learning-indicator";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

export default async function DocumentReviewPage({
  params,
}: {
  params: Promise<{ docId: string }>;
}) {
  const { docId } = await params;
  const t = await getTranslations("review");
  const orgId = await getActiveOrgId();

  if (!orgId) notFound();

  const [doc, matches, extractionLog] = await Promise.all([
    getDocumentWithDetails(orgId, docId),
    getMatchesByDocumentId(orgId, docId),
    getLatestExtractionLog(orgId, docId),
  ]);
  if (!doc) notFound();

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" render={<Link href={`/documents/${doc.direction === "expense" ? "expenses" : "income"}`} />}>
          <ArrowLeft className="mr-1 size-4" />
          Back
        </Button>
        <h1 className="text-xl font-semibold">{t("title")}</h1>
        {doc.documentNumber && (
          <span className="text-muted-foreground">#{doc.documentNumber}</span>
        )}
        {extractionLog && (
          <LearningIndicator
            tierUsed={extractionLog.tierUsed}
            exemplarCount={extractionLog.exemplarIds?.length ?? 0}
          />
        )}
      </div>

      <DocumentReview
        document={{
          id: doc.id,
          type: doc.type,
          documentNumber: doc.documentNumber,
          issueDate: doc.issueDate,
          dueDate: doc.dueDate,
          subtotal: doc.subtotal,
          vatAmount: doc.vatAmount,
          totalAmount: doc.totalAmount,
          currency: doc.currency,
          taxInvoiceSubtype: doc.taxInvoiceSubtype,
          isPp36Subject: doc.isPp36Subject,
          status: doc.status,
          needsReview: doc.needsReview,
          aiConfidence: doc.aiConfidence,
          reviewNotes: doc.reviewNotes,
          detectedLanguage: doc.detectedLanguage,
          updatedAt: doc.updatedAt?.toISOString() ?? null,
        }}
        files={doc.files.map((f) => ({
          id: f.id,
          fileUrl: f.fileUrl,
          pageNumber: f.pageNumber,
          originalFilename: f.originalFilename,
        }))}
        lineItems={doc.lineItems.map((li) => ({
          id: li.id,
          description: li.description,
          quantity: li.quantity,
          unitPrice: li.unitPrice,
          amount: li.amount,
          vatAmount: li.vatAmount,
          whtType: li.whtType,
        }))}
        vendor={
          doc.vendor
            ? {
                id: doc.vendor.id,
                name: doc.vendor.name,
                nameTh: doc.vendor.nameTh,
                displayAlias: doc.vendor.displayAlias,
                taxId: doc.vendor.taxId,
              }
            : null
        }
      />

      {matches.length > 0 && (
        <MatchedTransactions matches={matches} />
      )}
    </div>
  );
}
