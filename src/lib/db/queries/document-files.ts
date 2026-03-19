import { and, eq, isNull } from "drizzle-orm";
import { db } from "../index";
import { documentFiles } from "../schema";

export async function createDocumentFile(data: {
  orgId: string;
  documentId: string;
  fileUrl: string;
  fileType?: string | null;
  pageNumber?: number | null;
  originalFilename?: string | null;
}) {
  const [file] = await db
    .insert(documentFiles)
    .values({
      ...data,
      pipelineStatus: "uploaded",
    })
    .returning();
  return file;
}

export async function getFilesByDocument(orgId: string, documentId: string) {
  return db
    .select()
    .from(documentFiles)
    .where(
      and(
        eq(documentFiles.documentId, documentId),
        eq(documentFiles.orgId, orgId),
        isNull(documentFiles.deletedAt)
      )
    )
    .orderBy(documentFiles.pageNumber);
}

export async function updateFilePipelineStatus(
  orgId: string,
  fileId: string,
  status: "uploaded" | "extracting" | "validating" | "validated" | "completed" | "failed_extraction" | "failed_validation",
  extra?: {
    aiRawResponse?: unknown;
    aiModelUsed?: string;
    aiCostTokens?: number;
    aiCostUsd?: string;
    aiPurpose?: string;
    aiInputTokens?: number;
    aiOutputTokens?: number;
  }
) {
  const [file] = await db
    .update(documentFiles)
    .set({
      pipelineStatus: status,
      ...extra,
    })
    .where(and(eq(documentFiles.id, fileId), eq(documentFiles.orgId, orgId)))
    .returning();
  return file;
}
