import { db } from "../index";
import { extractionLog } from "../schema";
import { createOpenException } from "./exception-queue";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface InsertExtractionLogInput {
  documentId: string;
  orgId: string;
  vendorId: string | null;
  modelUsed: string;
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: string;
  latencyMs?: number;
  inngestIdempotencyKey: string;
}

// ---------------------------------------------------------------------------
// Insert extraction log (idempotent via inngest_idempotency_key)
// ---------------------------------------------------------------------------

/**
 * Insert an extraction log entry — the per-document audit trail of what the
 * model was asked, what it cost, and how long it took. Idempotent: a duplicate
 * inngest_idempotency_key is swallowed via ON CONFLICT DO NOTHING and raises an
 * info-level exception instead.
 */
export async function insertExtractionLog(
  input: InsertExtractionLogInput
): Promise<{ id: string } | null> {
  const [result] = await db
    .insert(extractionLog)
    .values({
      documentId: input.documentId,
      orgId: input.orgId,
      vendorId: input.vendorId,
      modelUsed: input.modelUsed,
      inputTokens: input.inputTokens ?? null,
      outputTokens: input.outputTokens ?? null,
      costUsd: input.costUsd ?? null,
      latencyMs: input.latencyMs ?? null,
      inngestIdempotencyKey: input.inngestIdempotencyKey,
    })
    .onConflictDoNothing({
      target: [extractionLog.inngestIdempotencyKey],
    })
    .returning({ id: extractionLog.id });

  if (!result) {
    await createOpenException({
      orgId: input.orgId,
      entityType: "document",
      entityId: input.documentId,
      exceptionType: "duplicate_extraction_log",
      severity: "info",
      summary: "Duplicate extraction log skipped by idempotency key",
      payload: {
        vendorId: input.vendorId,
        modelUsed: input.modelUsed,
        inngestIdempotencyKey: input.inngestIdempotencyKey,
      },
    });
  }

  // Returns null if conflict (idempotent skip)
  return result ?? null;
}
