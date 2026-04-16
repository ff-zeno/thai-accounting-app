import { inngest } from "../client";
import { db } from "@/lib/db";
import { vendors } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import {
  getFilesByDocument,
  updateFilePipelineStatus,
} from "@/lib/db/queries/document-files";
import {
  updateDocumentFromExtraction,
  createLineItems,
  deleteLineItemsByDocument,
} from "@/lib/db/queries/documents";
import { lookupWhtRate } from "@/lib/db/queries/wht-rates";
import {
  extractDocument,
  type ExtractionResult,
  type ExtractionContext,
} from "@/lib/ai/extract-document";
import { detectLanguage, type DetectedLanguage } from "@/lib/ai/detect-language";
import { translateVendorName } from "@/lib/ai/translate";
import { estimateCost, isWithinBudget } from "@/lib/ai/cost-tracker";
import { lookupCompany, mapBranchNumber } from "@/lib/api/dbd-client";
import type { InvoiceExtraction } from "@/lib/ai/schemas/invoice-extraction";
import {
  headPrivateBlob,
  fetchPrivateBlobBytes,
} from "@/lib/storage/private-blob";
// Dynamic imports to avoid pulling pdf-to-img into the Inngest route at build time.
// pdfjs-dist fails during Next.js page data collection if statically imported.
const lazyExtractPdfText = () =>
  import("@/lib/pdf/rasterize").then((m) => m.extractPdfText);
const lazyProbeVendorIdentity = () =>
  import("@/lib/vendor/probe-identity").then((m) => m.probeVendorIdentity);
import { getVendorTier } from "@/lib/db/queries/vendor-tier";
import { getTopExemplars } from "@/lib/db/queries/extraction-exemplars";
import { insertExtractionLog } from "@/lib/db/queries/extraction-log";

// ---------------------------------------------------------------------------
// Types for Inngest step serialization
// ---------------------------------------------------------------------------

interface FileRecord {
  id: string;
  fileUrl: string;
  fileType: string | null;
  pageNumber: number | null;
  originalFilename: string | null;
}

interface ValidatedExtraction extends InvoiceExtraction {
  detectedLanguage: DetectedLanguage;
  needsReview: boolean;
  warnings: string[];
}

interface ClassifiedLineItem {
  description: string;
  quantity?: string;
  unitPrice?: string;
  amount: string;
  vatAmount?: string;
  whtType?: string;
  whtRate?: string;
  whtAmount?: string;
  rdPaymentTypeCode?: string;
}

interface WhtClassificationResult {
  lineItems: ClassifiedLineItem[];
  warnings: string[];
}

// ---------------------------------------------------------------------------
// Error classification helpers
// ---------------------------------------------------------------------------

const PER_DOCUMENT_BUDGET_USD = 0.5;

/** Retryable errors: API timeouts, rate limits, 5xx, DB connection pool */
function isRetryableError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const msg = error.message.toLowerCase();
  return (
    msg.includes("timeout") ||
    msg.includes("rate limit") ||
    msg.includes("429") ||
    msg.includes("500") ||
    msg.includes("502") ||
    msg.includes("503") ||
    msg.includes("504") ||
    msg.includes("econnrefused") ||
    msg.includes("econnreset") ||
    msg.includes("connection pool") ||
    msg.includes("too many connections") ||
    msg.includes("fetch failed")
  );
}

const ACCEPTED_FILE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "application/pdf",
  "jpeg",
  "jpg",
  "png",
  "pdf",
]);
const MIN_FILE_SIZE_BYTES = 10_000; // 10KB

function validateFileType(
  fileType: string | null,
  filename: string | null
): void {
  if (!fileType && !filename) return; // Can't validate without metadata

  if (fileType && ACCEPTED_FILE_TYPES.has(fileType.toLowerCase())) return;

  // Fallback: check filename extension
  if (filename) {
    const ext = filename.split(".").pop()?.toLowerCase();
    if (ext && ACCEPTED_FILE_TYPES.has(ext)) return;
  }

  throw new Error(
    `Unsupported file type: ${fileType ?? "unknown"} (${filename ?? "no filename"}). Accepted: JPEG, PNG, PDF`
  );
}

// ---------------------------------------------------------------------------
// Pipeline
// ---------------------------------------------------------------------------

export const processDocument = inngest.createFunction(
  {
    id: "process-document",
    concurrency: [{ scope: "fn", key: "event.data.orgId", limit: 3 }],
    retries: 2,
  },
  { event: "document/uploaded" },
  async ({ event, step }) => {
    const { documentId, orgId } = event.data;

    // Step 1: Quality check — validate files before processing.
    // Bad files are marked failed_validation and excluded; only valid files
    // proceed to extraction. If ALL files fail, the pipeline fails.
    const files: FileRecord[] = await step.run("quality-check", async () => {
      const dbFiles = await getFilesByDocument(orgId, documentId);

      if (dbFiles.length === 0) {
        throw new Error(`No files found for document ${documentId}`);
      }

      const validFiles: typeof dbFiles = [];

      for (const file of dbFiles) {
        if (!file.fileUrl) {
          await updateFilePipelineStatus(orgId, file.id, "failed_validation");
          console.warn(`[process-document] File ${file.id} has no URL — skipping`);
          continue;
        }

        // Format validation: only JPEG, PNG, PDF
        try {
          validateFileType(file.fileType, file.originalFilename);
        } catch {
          await updateFilePipelineStatus(orgId, file.id, "failed_validation");
          console.warn(`[process-document] File ${file.id} has unsupported type — skipping`);
          continue;
        }

        // File size / accessibility check — authenticated HEAD against the
        // private Vercel Blob. A plain fetch returns 403 for private blobs.
        let fileFailed = false;
        try {
          const meta = await headPrivateBlob(file.fileUrl);
          if (meta) {
            if (meta.size < MIN_FILE_SIZE_BYTES) {
              await updateFilePipelineStatus(orgId, file.id, "failed_validation");
              console.warn(
                `[process-document] File ${file.originalFilename ?? file.id} too small (${meta.size} bytes) — skipping`
              );
              fileFailed = true;
            }

            // Resolution check: log warning only (decoding images in a
            // serverless function is expensive; skip for now)
            if (!fileFailed && meta.contentType?.startsWith("image/")) {
              console.warn(
                `[process-document] Image resolution check skipped for ${file.id} — requires image decoding`
              );
            }
          } else {
            await updateFilePipelineStatus(orgId, file.id, "failed_validation");
            console.warn(
              `[process-document] File ${file.id} HEAD failed — skipping`
            );
            fileFailed = true;
          }
        } catch (error) {
          if (isRetryableError(error)) {
            throw error;
          }
          console.warn(
            `[process-document] Could not verify file ${file.id}: ${error instanceof Error ? error.message : "unknown"}`
          );
        }

        if (fileFailed) continue;

        await updateFilePipelineStatus(orgId, file.id, "extracting");
        validFiles.push(file);
      }

      // If ALL files failed validation, fail the pipeline
      if (validFiles.length === 0) {
        throw new Error(
          `All files for document ${documentId} failed validation — no files to extract`
        );
      }

      return validFiles.map((f) => ({
        id: f.id,
        fileUrl: f.fileUrl,
        fileType: f.fileType,
        pageNumber: f.pageNumber,
        originalFilename: f.originalFilename,
      }));
    });

    // Step 2: Probe vendor identity (pre-extraction, text layer).
    // Extract text from PDF files and run regex to find a vendor tax ID.
    // If found, we can inject exemplars into the extraction prompt (Tier 1+).
    const probeResult: {
      vendorId: string | null;
      taxIdFound: string | null;
    } = await step.run("probe-vendor-identity", async () => {
      // Only probe PDF files — images don't have a text layer
      const pdfFiles = files.filter(
        (f) => f.fileType === "application/pdf" || f.fileType === "pdf"
      );
      if (pdfFiles.length === 0) {
        return { vendorId: null, taxIdFound: null };
      }

      try {
        // Use the first PDF file for probing
        const { bytes } = await fetchPrivateBlobBytes(pdfFiles[0].fileUrl);
        const extractPdfText = await lazyExtractPdfText();
        const pageTexts = await extractPdfText(bytes);
        const probeVendorIdentity = await lazyProbeVendorIdentity();
        const result = await probeVendorIdentity(orgId, pageTexts);
        return { vendorId: result.vendorId, taxIdFound: result.taxIdFound };
      } catch (error) {
        // Probe failure is non-fatal — fall back to Tier 0
        console.warn("[process-document] probe-vendor-identity failed:", error);
        return { vendorId: null, taxIdFound: null };
      }
    });

    // Step 3: Resolve extraction context (tier + exemplars).
    // If the probe found a known vendor, load their tier and exemplars.
    // Note: Inngest serializes step results through JSON, so we cast the
    // deserialized result back to ExtractionContext.
    const extractionContext = await step.run(
      "resolve-extraction-context",
      async (): Promise<ExtractionContext> => {
        if (!probeResult.vendorId) {
          return { tier: 0, vendorId: null, exemplarIds: [], exemplars: [] };
        }

        try {
          const tierRow = await getVendorTier(orgId, probeResult.vendorId);
          const tier = (tierRow?.tier === 1 ? 1 : 0) as 0 | 1;

          if (tier === 0) {
            return {
              tier: 0 as const,
              vendorId: probeResult.vendorId,
              exemplarIds: [],
              exemplars: [],
            };
          }

          // Tier 1: load top exemplars for prompt injection
          const exemplars = await getTopExemplars(
            orgId,
            probeResult.vendorId,
            3
          );

          return {
            tier,
            vendorId: probeResult.vendorId,
            exemplarIds: exemplars.map((e) => e.id),
            exemplars: exemplars.map((e) => ({
              fieldName: e.fieldName,
              aiValue: e.aiValue,
              userValue: e.userValue,
            })),
          };
        } catch (error) {
          console.warn("[process-document] resolve-extraction-context failed:", error);
          return { tier: 0 as const, vendorId: null, exemplarIds: [], exemplars: [] };
        }
      }
    );

    // Step 4: AI extraction per file (vision model).
    // Private Vercel Blob URLs are not fetchable by external model providers,
    // so we materialize each file's bytes server-side and inline them into
    // the AI SDK request (as `image` or `file` parts depending on type).
    const extraction: { data: InvoiceExtraction; cost: number } = await step.run(
      "ai-extraction",
      async () => {
        const extractionFiles = await Promise.all(
          files.map(async (f) => {
            const { bytes, contentType } = await fetchPrivateBlobBytes(
              f.fileUrl
            );
            return { bytes, contentType };
          })
        );

        // Budget check: per-org monthly budget
        // NOTE: Budget check is not atomic — concurrent extractions could both pass.
        // Acceptable because Inngest concurrency is limited to 3 per org.
        // For strict enforcement, use a DB-backed atomic counter.
        if (!(await isWithinBudget(orgId))) {
          // Terminal: don't retry, mark as failed
          for (const file of files) {
            await updateFilePipelineStatus(orgId, file.id, "failed_extraction");
          }
          await updateDocumentFromExtraction(orgId, documentId, {
            needsReview: true,
            reviewNotes: "AI budget exceeded — extraction skipped",
          });
          throw new Error(
            "Budget exceeded: monthly AI cost limit reached"
          );
        }

        try {
          const startMs = Date.now();
          const result: ExtractionResult = await extractDocument(
            extractionFiles,
            orgId,
            extractionContext
          );
          const latencyMs = Date.now() - startMs;

          const cost = estimateCost(
            result.modelUsed,
            result.tokenUsage.input,
            result.tokenUsage.output
          );

          // Per-document budget guard
          if (cost.totalCost > PER_DOCUMENT_BUDGET_USD) {
            for (const file of files) {
              await updateFilePipelineStatus(
                orgId,
                file.id,
                "failed_extraction"
              );
            }
            await updateDocumentFromExtraction(orgId, documentId, {
              needsReview: true,
              reviewNotes: `Extraction cost $${cost.totalCost.toFixed(4)} exceeded per-document budget of $${PER_DOCUMENT_BUDGET_USD}`,
            });
            throw new Error(
              `Budget exceeded: extraction cost $${cost.totalCost.toFixed(4)} > $${PER_DOCUMENT_BUDGET_USD} limit`
            );
          }

          // Update file records with AI metadata
          for (const file of files) {
            await updateFilePipelineStatus(orgId, file.id, "validating", {
              aiRawResponse: result.data,
              aiModelUsed: result.modelUsed,
              aiCostTokens:
                result.tokenUsage.input + result.tokenUsage.output,
              aiCostUsd: cost.totalCost.toFixed(6),
              aiPurpose: "extraction",
              aiInputTokens: result.tokenUsage.input,
              aiOutputTokens: result.tokenUsage.output,
            });
          }

          // Write extraction log (idempotent by inngest event ID + step)
          await insertExtractionLog({
            documentId,
            orgId,
            vendorId: extractionContext.vendorId,
            tierUsed: extractionContext.tier,
            exemplarIds: extractionContext.exemplarIds,
            modelUsed: result.modelUsed,
            inputTokens: result.tokenUsage.input,
            outputTokens: result.tokenUsage.output,
            costUsd: cost.totalCost.toFixed(8),
            latencyMs,
            inngestIdempotencyKey: `${event.id}:ai-extraction`,
          });

          return { data: result.data, cost: cost.totalCost };
        } catch (error) {
          // Only mark as failed for non-retryable errors (retryable ones
          // should let Inngest retry the step)
          if (!isRetryableError(error)) {
            for (const file of files) {
              await updateFilePipelineStatus(
                orgId,
                file.id,
                "failed_extraction"
              );
            }
          }
          throw error;
        }
      }
    );

    // Step 3: Merge, validate, detect language
    const validated: ValidatedExtraction = await step.run(
      "validate-extraction",
      async () => {
        const data = extraction.data;

        const warnings: string[] = [];

        // Math validation
        if (data.subtotal && data.vatAmount && data.totalAmount) {
          const subtotal = parseFloat(data.subtotal);
          const vat = parseFloat(data.vatAmount);
          const total = parseFloat(data.totalAmount);
          const calculated = subtotal + vat;
          if (Math.abs(calculated - total) > 0.5) {
            warnings.push(
              `Math mismatch: ${subtotal} + ${vat} = ${calculated}, but total is ${total}`
            );
          }
        }

        // Language detection from vendor name + line items
        const textSamples = [
          data.vendorName,
          ...(data.lineItems?.map((li) => li.description) ?? []),
        ]
          .filter(Boolean)
          .join(" ");
        const detectedLang = detectLanguage(textSamples);

        const needsReview = data.confidence < 0.8 || warnings.length > 0;

        // Warn on very low-confidence extractions (needs_user_action)
        if (data.confidence < 0.5) {
          warnings.push(
            `Very low confidence (${data.confidence}) — manual review strongly recommended`
          );
        }

        return {
          ...data,
          detectedLanguage: detectedLang,
          needsReview,
          warnings,
        } as ValidatedExtraction;
      }
    );

    // Step 4: Vendor lookup/create (with DBD verification)
    const vendorResult: {
      vendorId: string | null;
      vendorEntityType: "individual" | "company" | "foreign";
    } = await step.run("vendor-lookup", async () => {
      if (!validated.vendorTaxId)
        return { vendorId: null, vendorEntityType: "company" as const };

      // Look up by tax_id + branch
      const existing = await db
        .select()
        .from(vendors)
        .where(
          and(
            eq(vendors.orgId, orgId),
            eq(vendors.taxId, validated.vendorTaxId),
            eq(
              vendors.branchNumber,
              validated.vendorBranchNumber ?? "00000"
            )
          )
        )
        .limit(1);

      if (existing.length > 0) {
        return {
          vendorId: existing[0].id,
          vendorEntityType: existing[0].entityType,
        };
      }

      // Try DBD API verification before creating vendor
      const dbdResult = await lookupCompany(validated.vendorTaxId);

      let nameTh: string | null;
      let nameEn: string | null;
      let vendorAddress: string | null;
      let branchNumber: string;
      let dbdVerified: boolean;
      let dbdData: Record<string, unknown> | null;

      if (dbdResult) {
        // Use authoritative DBD data
        nameTh = dbdResult.nameTh || null;
        nameEn = dbdResult.nameEn || null;
        vendorAddress =
          dbdResult.address || validated.vendorAddress || null;
        branchNumber = mapBranchNumber(dbdResult.branchName);
        dbdVerified = true;
        dbdData = dbdResult as unknown as Record<string, unknown>;
      } else {
        // Fall back to AI-extracted data
        nameTh =
          validated.detectedLanguage === "th"
            ? (validated.vendorName ?? null)
            : null;
        nameEn =
          validated.vendorNameEn ??
          (validated.detectedLanguage === "en"
            ? (validated.vendorName ?? null)
            : null);
        vendorAddress = validated.vendorAddress || null;
        branchNumber = validated.vendorBranchNumber ?? "00000";
        dbdVerified = false;
        dbdData = null;

        // Auto-translate vendor name (only when DBD didn't provide names)
        if (validated.vendorName && validated.detectedLanguage !== "mixed") {
          try {
            const translated = await translateVendorName(
              validated.vendorName,
              validated.detectedLanguage === "th" ? "th" : "en",
              orgId
            );
            nameEn = nameEn || translated.nameEn;
            nameTh = nameTh || translated.nameTh;
          } catch {
            // Translation failure is non-fatal
          }
        }
      }

      const vendorName =
        nameEn || validated.vendorName || "Unknown Vendor";

      const [vendor] = await db
        .insert(vendors)
        .values({
          orgId,
          name: vendorName,
          nameTh,
          taxId: validated.vendorTaxId,
          branchNumber,
          address: vendorAddress,
          entityType: "company",
          dbdVerified,
          dbdData,
        })
        .returning();

      return { vendorId: vendor.id, vendorEntityType: vendor.entityType };
    });

    const { vendorId, vendorEntityType } = vendorResult;

    // Step 5: WHT classification — classify each line item's WHT rate
    const whtClassification: WhtClassificationResult = await step.run(
      "classify-wht",
      async () => {
        const lineItems = validated.lineItems ?? [];
        const warnings: string[] = [];
        const classified: ClassifiedLineItem[] = [];

        for (const li of lineItems) {
          const item: ClassifiedLineItem = {
            description: li.description,
            quantity: li.quantity?.toString(),
            unitPrice: li.unitPrice,
            amount: li.amount,
            vatAmount: li.vatAmount,
            whtType: li.whtType,
          };

          // Only classify if the AI suggested a WHT type
          if (!li.whtType) {
            classified.push(item);
            continue;
          }

          try {
            const rate = await lookupWhtRate(
              li.whtType,
              vendorEntityType,
              false, // e-WHT is determined at payment time, not extraction
              validated.issueDate ?? undefined
            );

            if (!rate) {
              warnings.push(
                `No WHT rate found for type "${li.whtType}" / entity "${vendorEntityType}" — left unclassified`
              );
              classified.push(item);
              continue;
            }

            item.rdPaymentTypeCode = rate.rdPaymentTypeCode ?? undefined;
            item.whtRate = rate.standardRate;

            // Calculate WHT amount: line_item.amount * wht_rate
            const amount = parseFloat(li.amount);
            const whtRate = parseFloat(rate.standardRate);
            if (!isNaN(amount) && !isNaN(whtRate)) {
              const whtAmount = amount * whtRate;
              item.whtAmount = whtAmount.toFixed(2);
            }
          } catch (error) {
            // WHT lookup failure is non-fatal — flag for review
            warnings.push(
              `WHT lookup failed for "${li.description}": ${error instanceof Error ? error.message : "unknown error"}`
            );
          }

          classified.push(item);
        }

        return { lineItems: classified, warnings };
      }
    );

    // Step 6: Store result
    await step.run("store-result", async () => {
      // Clear old line items if retrying
      await deleteLineItemsByDocument(orgId, documentId);

      // Merge all warnings
      const allWarnings = [
        ...validated.warnings,
        ...whtClassification.warnings,
      ];

      // WHT warnings force review
      const needsReview =
        validated.needsReview || whtClassification.warnings.length > 0;

      // Update document
      await updateDocumentFromExtraction(orgId, documentId, {
        vendorId,
        type: validated.documentType,
        documentNumber: validated.documentNumber,
        issueDate: validated.issueDate,
        dueDate: validated.dueDate,
        subtotal: validated.subtotal,
        vatAmount: validated.vatAmount,
        totalAmount: validated.totalAmount,
        currency: validated.currency ?? "THB",
        detectedLanguage: validated.detectedLanguage,
        aiConfidence: validated.confidence.toFixed(2),
        needsReview,
        reviewNotes:
          allWarnings.length > 0
            ? allWarnings.join("; ")
            : (validated.notes ?? null),
      });

      // Create line items with WHT classification data
      if (whtClassification.lineItems.length > 0) {
        await createLineItems(
          whtClassification.lineItems.map((li) => ({
            orgId,
            documentId,
            description: li.description,
            quantity: li.quantity,
            unitPrice: li.unitPrice,
            amount: li.amount,
            vatAmount: li.vatAmount,
            whtType: li.whtType,
            whtRate: li.whtRate,
            whtAmount: li.whtAmount,
            rdPaymentTypeCode: li.rdPaymentTypeCode,
          }))
        );
      }

      // Mark files as completed
      for (const file of files) {
        await updateFilePipelineStatus(orgId, file.id, "completed");
      }

      return { documentId, vendorId, confidence: validated.confidence };
    });
  }
);
