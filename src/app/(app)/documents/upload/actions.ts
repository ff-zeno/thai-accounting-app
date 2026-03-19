"use server";

import { getActiveOrgId } from "@/lib/utils/org-context";
import { createDocument } from "@/lib/db/queries/documents";
import { createDocumentFile } from "@/lib/db/queries/document-files";
import { createStorage } from "@/lib/storage";
import { inngest } from "@/lib/inngest/client";
import { revalidatePath } from "next/cache";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "application/pdf"];

export interface UploadResult {
  success: boolean;
  documentId?: string;
  error?: string;
}

export async function uploadDocument(
  formData: FormData
): Promise<UploadResult> {
  const orgId = await getActiveOrgId();
  if (!orgId) {
    return { success: false, error: "No organization selected" };
  }

  const direction = formData.get("direction") as "expense" | "income";
  if (!direction || !["expense", "income"].includes(direction)) {
    return { success: false, error: "Invalid document direction" };
  }

  const files = formData.getAll("files") as File[];
  if (files.length === 0) {
    return { success: false, error: "No files uploaded" };
  }

  // Validate files
  for (const file of files) {
    if (file.size > MAX_FILE_SIZE) {
      return {
        success: false,
        error: `File "${file.name}" exceeds 10MB limit`,
      };
    }
    if (!ALLOWED_TYPES.includes(file.type)) {
      return {
        success: false,
        error: `File "${file.name}" has unsupported format. Use JPG, PNG, or PDF`,
      };
    }
  }

  // Create document record
  const doc = await createDocument({
    orgId,
    direction,
  });

  // Upload files and create file records
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

  // Send Inngest event to start processing pipeline
  await inngest.send({
    name: "document/uploaded",
    data: {
      documentId: doc.id,
      orgId,
      fileIds: fileRecords.map((f) => f.id),
    },
  });

  revalidatePath(`/documents/${direction === "expense" ? "expenses" : "income"}`);

  return { success: true, documentId: doc.id };
}
