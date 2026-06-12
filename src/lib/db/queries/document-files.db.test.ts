import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  vi,
} from "vitest";
import { and, eq, sql } from "drizzle-orm";
import {
  createTestDb,
  migrateTestDb,
  resetTestDb,
  createTestOrg,
  createTestDocument,
} from "@/tests/db-test-utils";
import * as schema from "@/lib/db/schema";

/*
 * INTEGRATION TEST -- Document file terminal failures are auditable
 * ==================================================================
 *
 * The document pipeline (process-document) marks files failed_validation /
 * failed_extraction at terminal sites. Per CLAUDE.md, every mutation must be
 * logged to audit_log. This test exercises recordTerminalFailure end-to-end:
 * the document_files.pipeline_status update AND the audit_log row.
 *
 * Requires Docker Postgres running:
 *   docker compose -f docker-compose.test.yml up -d
 */

const { db: testDb, pool } = createTestDb();

// Mock the db module so the query functions and the audit-log helper
// (both import from @/lib/db/index) use the test database.
vi.mock("@/lib/db/index", () => ({ db: testDb }));

// Import AFTER the mock is set up.
const { recordTerminalFailure } = await import(
  "@/lib/inngest/functions/process-document"
);

beforeAll(async () => {
  await resetTestDb(pool);
  await migrateTestDb(pool);
});

afterAll(async () => {
  await resetTestDb(pool);
  await pool.end();
});

beforeEach(async () => {
  await testDb.execute(sql`
    TRUNCATE TABLE
      audit_log,
      document_files,
      documents,
      organizations
    CASCADE
  `);
});

describe("recordTerminalFailure", () => {
  it("marks the file failed and writes an audit_log row with the reason", async () => {
    const org = await createTestOrg(testDb);
    const doc = await createTestDocument(testDb, org.id);
    const [file] = await testDb
      .insert(schema.documentFiles)
      .values({
        orgId: org.id,
        documentId: doc.id,
        fileUrl: "https://blob.example.com/test.pdf",
        fileType: "application/pdf",
        originalFilename: "test.pdf",
        pipelineStatus: "uploaded",
      })
      .returning();

    await recordTerminalFailure(
      org.id,
      file.id,
      "failed_validation",
      "file too small: 512 bytes < 10000 minimum (quality check)"
    );

    // Pipeline status was updated
    const [updated] = await testDb
      .select()
      .from(schema.documentFiles)
      .where(eq(schema.documentFiles.id, file.id));
    expect(updated.pipelineStatus).toBe("failed_validation");

    // Audit row exists with the status and reason
    const auditRows = await testDb
      .select()
      .from(schema.auditLog)
      .where(
        and(
          eq(schema.auditLog.orgId, org.id),
          eq(schema.auditLog.entityType, "document_file"),
          eq(schema.auditLog.entityId, file.id)
        )
      );
    expect(auditRows).toHaveLength(1);
    expect(auditRows[0].action).toBe("update");
    expect(auditRows[0].newValue).toMatchObject({
      pipelineStatus: "failed_validation",
      error: "file too small: 512 bytes < 10000 minimum (quality check)",
    });
    // System action — no actor
    expect(auditRows[0].actorId).toBeNull();
  });
});
