"use server";

import { getActiveOrgId } from "@/lib/utils/org-context";
import { createDocument } from "@/lib/db/queries/documents";
import { createLineItems } from "@/lib/db/queries/documents";
import { updateDocumentFromExtraction } from "@/lib/db/queries/documents";
import { createDocumentFile } from "@/lib/db/queries/document-files";
import { findVendorByTaxId, createVendor } from "@/lib/db/queries/vendors";
import { createStorage } from "@/lib/storage";
import { extractIdCard } from "@/lib/ai/extract-id-card";
import { getServiceCategory } from "@/lib/tax/service-categories";
import {
  validateThaiCitizenId,
  sanitizeTaxId,
} from "@/lib/utils/validators";
import { revalidatePath } from "next/cache";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png"];

export interface IndividualPaymentResult {
  success: boolean;
  documentId?: string;
  vendorId?: string;
  extractedData?: {
    nameTh: string;
    nameEn?: string;
    citizenId: string;
    confidence: number;
  };
  error?: string;
}

export async function createIndividualPaymentAction(
  formData: FormData
): Promise<IndividualPaymentResult> {
  const orgId = await getActiveOrgId();
  if (!orgId) {
    return { success: false, error: "No organization selected" };
  }

  // Read form fields
  const files = formData.getAll("files") as File[];
  const amount = formData.get("amount") as string;
  const serviceCategory = formData.get("serviceCategory") as string;
  const paymentDate = formData.get("paymentDate") as string;
  const note = (formData.get("note") as string) || null;

  // Validate required fields
  if (files.length === 0) {
    return { success: false, error: "ID card image is required" };
  }
  if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
    return { success: false, error: "A valid positive amount is required" };
  }
  if (!serviceCategory) {
    return { success: false, error: "Service category is required" };
  }

  const category = getServiceCategory(serviceCategory);
  if (!category) {
    return { success: false, error: "Invalid service category" };
  }

  // Validate files
  for (const file of files) {
    if (file.size > MAX_FILE_SIZE) {
      return {
        success: false,
        error: `File "${file.name}" exceeds 10MB limit`,
      };
    }
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      return {
        success: false,
        error: `File "${file.name}" must be JPG or PNG`,
      };
    }
  }

  // Create document record first (draft)
  const doc = await createDocument({
    orgId,
    direction: "expense",
    type: "receipt",
    status: "draft",
  });

  // Upload files
  const storage = createStorage();
  const fileRecords = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const buffer = Buffer.from(await file.arrayBuffer());
    const ext = file.name.split(".").pop() || "jpg";
    const path = `documents/${orgId}/${doc.id}/${i + 1}.${ext}`;

    const { url } = await storage.upload(path, buffer, file.type);

    const fileRecord = await createDocumentFile({
      orgId,
      documentId: doc.id,
      fileUrl: url,
      fileType: file.type,
      pageNumber: i + 1,
      originalFilename: file.name,
    });

    fileRecords.push(fileRecord);
  }

  // Extract ID card data from the first image
  let extractedData: IndividualPaymentResult["extractedData"];
  try {
    const firstFileUrl = fileRecords[0].fileUrl;
    const extraction = await extractIdCard(firstFileUrl, orgId);
    const citizenIdRaw = sanitizeTaxId(extraction.data.citizenId);

    // Validate citizen ID checksum
    const validation = validateThaiCitizenId(citizenIdRaw);
    if (!validation.valid) {
      // Still proceed, but flag for review
      extractedData = {
        nameTh: extraction.data.nameTh,
        nameEn: extraction.data.nameEn ?? undefined,
        citizenId: citizenIdRaw,
        confidence: Math.min(extraction.data.confidence, 0.5),
      };
    } else {
      extractedData = {
        nameTh: extraction.data.nameTh,
        nameEn: extraction.data.nameEn ?? undefined,
        citizenId: citizenIdRaw,
        confidence: extraction.data.confidence,
      };
    }
  } catch {
    // Extraction failed - document still created but needs manual review
    extractedData = undefined;
  }

  // Auto-create or find vendor
  let vendorId: string | undefined;

  if (extractedData?.citizenId) {
    const existingVendor = await findVendorByTaxId(
      orgId,
      extractedData.citizenId,
      "00000"
    );

    if (existingVendor) {
      vendorId = existingVendor.id;
    } else {
      try {
        const newVendor = await createVendor({
          orgId,
          name: extractedData.nameEn || extractedData.nameTh,
          nameTh: extractedData.nameTh,
          taxId: extractedData.citizenId,
          branchNumber: "00000",
          entityType: "individual",
          isVatRegistered: false,
        });
        vendorId = newVendor.id;
      } catch (err: unknown) {
        // Unique constraint race condition - try to find again
        if (
          err instanceof Error &&
          err.message.includes("vendors_org_tax_branch")
        ) {
          const existing = await findVendorByTaxId(
            orgId,
            extractedData.citizenId,
            "00000"
          );
          vendorId = existing?.id;
        }
      }
    }
  }

  // Calculate WHT
  const amountNum = parseFloat(amount);
  const rateNum = parseFloat(category.rate);
  const whtAmount = (amountNum * rateNum).toFixed(2);

  // Update document with extracted info and amounts
  await updateDocumentFromExtraction(orgId, doc.id, {
    vendorId: vendorId ?? null,
    totalAmount: amountNum.toFixed(2),
    subtotal: amountNum.toFixed(2),
    issueDate: paymentDate || null,
    category: category.value,
    needsReview: true,
    aiConfidence: extractedData
      ? extractedData.confidence.toFixed(2)
      : null,
    reviewNotes: note,
  });

  // Create line item with WHT info
  await createLineItems([
    {
      orgId,
      documentId: doc.id,
      description:
        note || `${category.label} - ${extractedData?.nameTh ?? "Unknown"}`,
      amount: amountNum.toFixed(2),
      whtRate: category.rate,
      whtAmount,
      whtType: category.value,
      rdPaymentTypeCode: category.code,
    },
  ]);

  revalidatePath("/documents/expenses");

  return {
    success: true,
    documentId: doc.id,
    vendorId,
    extractedData,
  };
}
