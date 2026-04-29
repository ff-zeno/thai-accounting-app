import { and, desc, eq, sql, gte } from "drizzle-orm";
import { db } from "../index";
import { extractionLog } from "../schema";
import { orgScopeAlive } from "../helpers/org-scope";
import { createOpenException } from "./exception-queue";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface InsertExtractionLogInput {
  documentId: string;
  orgId: string;
  vendorId: string | null;
  tierUsed: number;
  exemplarIds: string[];
  modelUsed: string;
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: string;
  latencyMs?: number;
  inngestIdempotencyKey: string;
}

export interface ExtractionLogRow {
  id: string;
  documentId: string;
  orgId: string;
  vendorId: string | null;
  tierUsed: number;
  exemplarIds: string[] | null;
  modelUsed: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  costUsd: string | null;
  latencyMs: number | null;
  inngestIdempotencyKey: string;
  createdAt: Date;
}

// ---------------------------------------------------------------------------
// Insert extraction log (idempotent via inngest_idempotency_key)
// ---------------------------------------------------------------------------

/**
 * Insert an extraction log entry. Idempotent — duplicate
 * inngest_idempotency_key is silently ignored via ON CONFLICT DO NOTHING.
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
      tierUsed: input.tierUsed,
      exemplarIds: input.exemplarIds.length > 0 ? input.exemplarIds : null,
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
        tierUsed: input.tierUsed,
        modelUsed: input.modelUsed,
        inngestIdempotencyKey: input.inngestIdempotencyKey,
      },
    });
  }

  // Returns null if conflict (idempotent skip)
  return result ?? null;
}

// ---------------------------------------------------------------------------
// Get latest extraction log for a document
// ---------------------------------------------------------------------------

export async function getLatestExtractionLog(
  orgId: string,
  documentId: string
): Promise<ExtractionLogRow | null> {
  const [row] = await db
    .select()
    .from(extractionLog)
    .where(
      and(
        ...orgScopeAlive(extractionLog, orgId),
        eq(extractionLog.documentId, documentId)
      )
    )
    .orderBy(desc(extractionLog.createdAt))
    .limit(1);

  return row ?? null;
}

// ---------------------------------------------------------------------------
// Get extraction logs for a vendor (for correction rate calculation)
// ---------------------------------------------------------------------------

export async function getRecentExtractionLogs(
  orgId: string,
  vendorId: string,
  limit: number = 30
): Promise<ExtractionLogRow[]> {
  return db
    .select()
    .from(extractionLog)
    .where(
      and(
        ...orgScopeAlive(extractionLog, orgId),
        eq(extractionLog.vendorId, vendorId)
      )
    )
    .orderBy(desc(extractionLog.createdAt))
    .limit(limit);
}

// ---------------------------------------------------------------------------
// Has recent extraction for vendor (Phase 8 Phase 3 — decay check)
// ---------------------------------------------------------------------------

/**
 * Check if there's been any extraction log entry for a vendor since the given date.
 * Used by exemplar decay to avoid decaying vendors that are still active.
 */
export async function hasRecentExtractionForVendor(
  vendorId: string,
  since: Date
): Promise<boolean> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(extractionLog)
    .where(
      and(
        eq(extractionLog.vendorId, vendorId),
        gte(extractionLog.createdAt, since)
      )
    )
    .limit(1);
  return row.count > 0;
}
