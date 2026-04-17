import { and, eq, sql, count, isNull } from "drizzle-orm";
import { db } from "../index";
import { extractionCompiledPatterns } from "../schema";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface InsertCompiledPatternInput {
  vendorKey: string;
  scopeKind: "org" | "global";
  orgId?: string | null;
  version: number;
  sourceTs: string;
  compiledJs: string;
  tsCompilerVersion: string;
  astHash: string;
  trainingSetHash: string;
  requiresManualReview?: boolean;
}

export interface CompiledPatternRow {
  id: string;
  vendorKey: string;
  scopeKind: "org" | "global";
  orgId: string | null;
  version: number;
  sourceTs: string;
  compiledJs: string;
  tsCompilerVersion: string;
  astHash: string;
  trainingSetHash: string;
  shadowAccuracy: string | null;
  shadowSampleSize: number | null;
  status: "shadow" | "active" | "retired";
  requiresManualReview: boolean;
  createdAt: Date;
  activatedAt: Date | null;
  retiredAt: Date | null;
  retirementReason: string | null;
}

export interface CompiledPatternStats {
  active: number;
  shadow: number;
  retired: number;
  awaitingReview: number;
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

export async function getActivePattern(
  vendorKey: string,
  scopeKind: "org" | "global",
  orgId?: string | null
): Promise<CompiledPatternRow | null> {
  const conditions = [
    eq(extractionCompiledPatterns.vendorKey, vendorKey),
    eq(extractionCompiledPatterns.scopeKind, scopeKind),
    eq(extractionCompiledPatterns.status, "active"),
  ];

  if (scopeKind === "org" && orgId) {
    conditions.push(eq(extractionCompiledPatterns.orgId, orgId));
  } else {
    conditions.push(isNull(extractionCompiledPatterns.orgId));
  }

  const [row] = await db
    .select()
    .from(extractionCompiledPatterns)
    .where(and(...conditions))
    .limit(1);

  return (row as CompiledPatternRow) ?? null;
}

export async function getPatternById(
  id: string
): Promise<CompiledPatternRow | null> {
  const [row] = await db
    .select()
    .from(extractionCompiledPatterns)
    .where(eq(extractionCompiledPatterns.id, id))
    .limit(1);

  return (row as CompiledPatternRow) ?? null;
}

export async function getPatternsAwaitingReview(): Promise<
  CompiledPatternRow[]
> {
  return db
    .select()
    .from(extractionCompiledPatterns)
    .where(
      and(
        eq(extractionCompiledPatterns.requiresManualReview, true),
        eq(extractionCompiledPatterns.status, "shadow")
      )
    ) as Promise<CompiledPatternRow[]>;
}

export async function getCompiledPatternStats(): Promise<CompiledPatternStats> {
  const [active] = await db
    .select({ count: count() })
    .from(extractionCompiledPatterns)
    .where(eq(extractionCompiledPatterns.status, "active"));

  const [shadow] = await db
    .select({ count: count() })
    .from(extractionCompiledPatterns)
    .where(eq(extractionCompiledPatterns.status, "shadow"));

  const [retired] = await db
    .select({ count: count() })
    .from(extractionCompiledPatterns)
    .where(eq(extractionCompiledPatterns.status, "retired"));

  const [awaiting] = await db
    .select({ count: count() })
    .from(extractionCompiledPatterns)
    .where(
      and(
        eq(extractionCompiledPatterns.requiresManualReview, true),
        eq(extractionCompiledPatterns.status, "shadow")
      )
    );

  return {
    active: active.count,
    shadow: shadow.count,
    retired: retired.count,
    awaitingReview: awaiting.count,
  };
}

export async function countAutonomouslyPromoted(): Promise<number> {
  const [row] = await db
    .select({ count: count() })
    .from(extractionCompiledPatterns)
    .where(
      and(
        eq(extractionCompiledPatterns.status, "active"),
        eq(extractionCompiledPatterns.requiresManualReview, false)
      )
    );
  return row.count;
}

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------

export async function insertCompiledPattern(
  input: InsertCompiledPatternInput
): Promise<{ id: string }> {
  const [result] = await db
    .insert(extractionCompiledPatterns)
    .values({
      vendorKey: input.vendorKey,
      scopeKind: input.scopeKind,
      orgId: input.orgId ?? null,
      version: input.version,
      sourceTs: input.sourceTs,
      compiledJs: input.compiledJs,
      tsCompilerVersion: input.tsCompilerVersion,
      astHash: input.astHash,
      trainingSetHash: input.trainingSetHash,
      requiresManualReview: input.requiresManualReview ?? true,
    })
    .returning({ id: extractionCompiledPatterns.id });

  return result;
}

export async function activatePattern(id: string): Promise<void> {
  await db
    .update(extractionCompiledPatterns)
    .set({
      status: "active",
      activatedAt: sql`now()`,
    })
    .where(eq(extractionCompiledPatterns.id, id));
}

export async function retirePattern(
  id: string,
  reason: string
): Promise<void> {
  await db
    .update(extractionCompiledPatterns)
    .set({
      status: "retired",
      retiredAt: sql`now()`,
      retirementReason: reason,
    })
    .where(eq(extractionCompiledPatterns.id, id));
}

export async function approvePattern(id: string): Promise<void> {
  await db
    .update(extractionCompiledPatterns)
    .set({ requiresManualReview: false })
    .where(eq(extractionCompiledPatterns.id, id));
}

export async function updateShadowResults(
  id: string,
  accuracy: number,
  sampleSize: number
): Promise<void> {
  await db
    .update(extractionCompiledPatterns)
    .set({
      shadowAccuracy: accuracy.toFixed(4),
      shadowSampleSize: sampleSize,
    })
    .where(eq(extractionCompiledPatterns.id, id));
}
