import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";
import * as schema from "@/lib/db/schema";
import {
  createTestDb,
  createTestOrg,
  migrateTestDb,
  resetTestDb,
} from "@/tests/db-test-utils";

const { db: testDb, pool } = createTestDb();
let executeCopilotTool: typeof import("./copilot-tools").executeCopilotTool;
let executeCopilotPrompt: typeof import("./copilot-tools").executeCopilotPrompt;
let interpretCopilotPrompt: typeof import("./copilot-tools").interpretCopilotPrompt;
let getCopilotDashboard: typeof import("./copilot-tools").getCopilotDashboard;
let seedStandardGlAccounts: typeof import("./general-ledger").seedStandardGlAccounts;
let lockPeriod: typeof import("./period-locks").lockPeriod;

beforeAll(async () => {
  await resetTestDb(pool);
  await migrateTestDb(pool);
  vi.doMock("../index", () => ({ db: testDb }));
  ({
    executeCopilotTool,
    executeCopilotPrompt,
    interpretCopilotPrompt,
    getCopilotDashboard,
  } = await import("./copilot-tools"));
  ({ seedStandardGlAccounts } = await import("./general-ledger"));
  ({ lockPeriod } = await import("./period-locks"));
});

afterAll(async () => {
  await resetTestDb(pool);
  await pool.end();
});

beforeEach(async () => {
  await testDb.execute(sql`
    TRUNCATE TABLE
      exception_queue,
      copilot_tool_events,
      copilot_messages,
      copilot_sessions,
      document_line_items,
      documents,
      vendors,
      gl_accounts,
      organizations
    CASCADE
  `);
});

describe("copilot read tools", () => {
  it("runs org-scoped document search and records an audit-grade tool event", async () => {
    const org = await createTestOrg(testDb);
    await testDb.insert(schema.documents).values({
      orgId: org.id,
      type: "invoice",
      direction: "expense",
      documentNumber: "INV-COPILOT-1",
      issueDate: "2026-05-01",
      totalAmount: "1000.00",
      totalAmountThb: "1000.00",
      status: "confirmed",
    });

    const result = await executeCopilotTool({
      orgId: org.id,
      userId: "user_1",
      toolName: "search_documents",
      rawInput: { query: "COPILOT", limit: 5 },
    });

    expect("rows" in result.output ? result.output.rows : []).toHaveLength(1);
    const events = await testDb.select().from(schema.copilotToolEvents);
    expect(events).toHaveLength(1);
    expect(events[0].toolName).toBe("search_documents");
    expect(events[0].risk).toBe("read");
  });

  it("blocks cross-org session linkage at the database boundary", async () => {
    const org = await createTestOrg(testDb);
    const otherOrg = await createTestOrg(testDb);
    const [session] = await testDb
      .insert(schema.copilotSessions)
      .values({ orgId: org.id, userId: "user_1" })
      .returning();

    await expect(
      testDb.insert(schema.copilotMessages).values({
        orgId: otherOrg.id,
        sessionId: session.id,
        role: "tool",
        content: "bad link",
      })
    ).rejects.toThrow(/Failed query/);
  });

  it("lists registered read tools on the dashboard", async () => {
    const org = await createTestOrg(testDb);
    const dashboard = await getCopilotDashboard(org.id, "user_1");
    expect(dashboard.tools.map((tool) => tool.name)).toContain("get_tax_position");
    expect(dashboard.tools.map((tool) => tool.name)).toContain("preview_recode_documents");
    expect(
      dashboard.tools.find((tool) => tool.name === "preview_recode_documents")
    ).toMatchObject({ risk: "draft", previewRequired: true });
  });

  it("routes natural-language prompts to safe typed tools and records assistant grounding", async () => {
    const org = await createTestOrg(testDb);
    await testDb.insert(schema.documents).values({
      orgId: org.id,
      type: "invoice",
      direction: "expense",
      documentNumber: "NL-COPILOT-1",
      issueDate: "2026-05-01",
      totalAmount: "1000.00",
      totalAmountThb: "1000.00",
      status: "confirmed",
    });

    expect(interpretCopilotPrompt("show VAT position 2026-05")).toMatchObject({
      toolName: "get_tax_position",
      rawInput: { periodYear: 2026, periodMonth: 5 },
    });

    const result = await executeCopilotPrompt({
      orgId: org.id,
      userId: "user_1",
      actorRole: "accountant",
      prompt: 'Find documents "NL-COPILOT"',
    });

    expect(result.interpretation).toMatchObject({
      toolName: "search_documents",
    });
    expect("rows" in result.output ? result.output.rows : []).toHaveLength(1);
    const messages = await testDb
      .select({
        role: schema.copilotMessages.role,
        content: schema.copilotMessages.content,
        toolName: schema.copilotMessages.toolName,
      })
      .from(schema.copilotMessages)
      .orderBy(schema.copilotMessages.createdAt);
    expect(messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          role: "user",
          content: 'Find documents "NL-COPILOT"',
        }),
        expect.objectContaining({
          role: "assistant",
          content: "Routed to document search.",
          toolName: "search_documents",
        }),
      ])
    );
  });

  it("previews draft document recoding without mutation", async () => {
    const org = await createTestOrg(testDb);
    await seedStandardGlAccounts(org.id);
    const [draftDoc, confirmedDoc] = await testDb.insert(schema.documents).values([
      {
        orgId: org.id,
        type: "invoice",
        direction: "expense",
        documentNumber: "REC-COPILOT-DRAFT",
        issueDate: "2026-05-01",
        totalAmount: "1000.00",
        totalAmountThb: "1000.00",
        status: "draft",
        category: "office",
      },
      {
        orgId: org.id,
        type: "invoice",
        direction: "expense",
        documentNumber: "REC-COPILOT-CONFIRMED",
        issueDate: "2026-05-02",
        totalAmount: "2000.00",
        totalAmountThb: "2000.00",
        status: "confirmed",
        category: "office",
      },
    ]).returning();
    await testDb.insert(schema.documentLineItems).values([
      {
        orgId: org.id,
        documentId: draftDoc.id,
        description: "Draft service",
        amount: "1000.00",
        accountCode: "6110",
      },
      {
        orgId: org.id,
        documentId: confirmedDoc.id,
        description: "Confirmed service",
        amount: "2000.00",
        accountCode: "6110",
      },
    ]);

    const result = await executeCopilotTool({
      orgId: org.id,
      userId: "user_1",
      actorRole: "accountant",
      toolName: "preview_recode_documents",
      rawInput: { query: "REC-COPILOT", targetAccountCode: "6110", limit: 10 },
    });
    const rows = "rows" in result.output ? result.output.rows : [];

    expect(rows).toHaveLength(2);
    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          documentNumber: "REC-COPILOT-DRAFT",
          targetAccountCode: "6110",
          canApply: true,
        }),
        expect.objectContaining({
          documentNumber: "REC-COPILOT-CONFIRMED",
          canApply: false,
        }),
      ])
    );
    const [event] = await testDb
      .select()
      .from(schema.copilotToolEvents)
      .where(sql`${schema.copilotToolEvents.toolName} = 'preview_recode_documents'`);
    expect(event.risk).toBe("draft");
    expect(event.previewRequired).toBe(true);
  });

  it("applies confirmed recodes to draft document line items only", async () => {
    const org = await createTestOrg(testDb);
    await seedStandardGlAccounts(org.id);
    const [draftDoc, confirmedDoc] = await testDb.insert(schema.documents).values([
      {
        orgId: org.id,
        type: "invoice",
        direction: "expense",
        documentNumber: "APPLY-COPILOT-DRAFT",
        issueDate: "2026-05-01",
        totalAmount: "1000.00",
        totalAmountThb: "1000.00",
        status: "draft",
        category: "apply",
      },
      {
        orgId: org.id,
        type: "invoice",
        direction: "expense",
        documentNumber: "APPLY-COPILOT-CONFIRMED",
        issueDate: "2026-05-02",
        totalAmount: "2000.00",
        totalAmountThb: "2000.00",
        status: "confirmed",
        category: "apply",
      },
    ]).returning();
    await testDb.insert(schema.documentLineItems).values([
      {
        orgId: org.id,
        documentId: draftDoc.id,
        description: "Draft service",
        amount: "1000.00",
        accountCode: "6110",
      },
      {
        orgId: org.id,
        documentId: confirmedDoc.id,
        description: "Confirmed service",
        amount: "2000.00",
        accountCode: "6110",
      },
    ]);

    await expect(
      executeCopilotTool({
        orgId: org.id,
        userId: "user_1",
        actorRole: "accountant",
        toolName: "apply_recode_documents",
        rawInput: {
          query: "APPLY-COPILOT",
          targetAccountCode: "6810",
          confirmationText: "wrong",
          limit: 10,
        },
      })
    ).rejects.toThrow(/Confirmation text/);
    const [failedEvent] = await testDb
      .select()
      .from(schema.copilotToolEvents)
      .where(sql`${schema.copilotToolEvents.toolName} = 'apply_recode_documents'`);
    expect(failedEvent).toMatchObject({
      status: "failed",
      risk: "bulk_write",
      previewRequired: true,
    });
    expect(failedEvent.input).toMatchObject({
      query: "APPLY-COPILOT",
      confirmationText: "wrong",
    });

    const result = await executeCopilotTool({
      orgId: org.id,
      userId: "user_1",
      actorRole: "accountant",
      toolName: "apply_recode_documents",
      rawInput: {
        query: "APPLY-COPILOT",
        targetAccountCode: "6810",
        confirmationText: "APPLY RECODE",
        limit: 10,
      },
    });

    expect("summary" in result.output ? result.output.summary : {}).toMatchObject({
      targetAccountCode: "6810",
      updatedLineCount: 1,
      updatedDocumentCount: 1,
      skippedNonDraftCount: 1,
      skippedLockedPeriodCount: 0,
    });
    const events = await testDb
      .select()
      .from(schema.copilotToolEvents)
      .where(sql`${schema.copilotToolEvents.toolName} = 'apply_recode_documents'`)
      .orderBy(schema.copilotToolEvents.createdAt);
    expect(events.map((event) => event.status)).toEqual(["failed", "succeeded"]);
    expect(events[1]).toMatchObject({
      risk: "bulk_write",
      previewRequired: true,
    });
    const lines = await testDb
      .select({
        documentId: schema.documentLineItems.documentId,
        accountCode: schema.documentLineItems.accountCode,
      })
      .from(schema.documentLineItems)
      .orderBy(schema.documentLineItems.createdAt);
    expect(lines).toEqual(
      expect.arrayContaining([
        { documentId: draftDoc.id, accountCode: "6810" },
        { documentId: confirmedDoc.id, accountCode: "6110" },
      ])
    );
  });

  it("blocks staff from write tools before mutating draft document lines", async () => {
    const org = await createTestOrg(testDb);
    await seedStandardGlAccounts(org.id);
    const [draftDoc] = await testDb.insert(schema.documents).values({
      orgId: org.id,
      type: "invoice",
      direction: "expense",
      documentNumber: "STAFF-BLOCK-COPILOT",
      issueDate: "2026-05-01",
      totalAmount: "1000.00",
      totalAmountThb: "1000.00",
      status: "draft",
      category: "staff-block",
    }).returning();
    await testDb.insert(schema.documentLineItems).values({
      orgId: org.id,
      documentId: draftDoc.id,
      description: "Draft service",
      amount: "1000.00",
      accountCode: "6110",
    });

    await expect(
      executeCopilotTool({
        orgId: org.id,
        userId: "staff_user",
        actorRole: "staff",
        toolName: "apply_recode_documents",
        rawInput: {
          query: "STAFF-BLOCK-COPILOT",
          targetAccountCode: "6810",
          confirmationText: "APPLY RECODE",
          limit: 10,
        },
      })
    ).rejects.toThrow(/requires accountant role/);

    const [line] = await testDb
      .select({ accountCode: schema.documentLineItems.accountCode })
      .from(schema.documentLineItems)
      .where(sql`${schema.documentLineItems.documentId} = ${draftDoc.id}`);
    expect(line.accountCode).toBe("6110");

    const [event] = await testDb
      .select()
      .from(schema.copilotToolEvents)
      .where(sql`${schema.copilotToolEvents.toolName} = 'apply_recode_documents'`);
    expect(event).toMatchObject({
      status: "failed",
      risk: "bulk_write",
      previewRequired: true,
      createdByUserId: "staff_user",
    });
  });

  it("skips draft recodes in locked VAT or GL periods", async () => {
    const org = await createTestOrg(testDb);
    await seedStandardGlAccounts(org.id);
    const [draftDoc] = await testDb.insert(schema.documents).values({
      orgId: org.id,
      type: "invoice",
      direction: "expense",
      documentNumber: "LOCKED-COPILOT-DRAFT",
      issueDate: "2026-05-01",
      totalAmount: "1000.00",
      totalAmountThb: "1000.00",
      status: "draft",
      category: "locked",
      vatPeriodYear: 2026,
      vatPeriodMonth: 5,
    }).returning();
    await testDb.insert(schema.documentLineItems).values({
      orgId: org.id,
      documentId: draftDoc.id,
      description: "Locked period service",
      amount: "1000.00",
      accountCode: "6110",
    });
    await lockPeriod({
      orgId: org.id,
      domain: "vat",
      periodYear: 2026,
      periodMonth: 5,
      lockedByUserId: "user_1",
      lockReason: "test lock",
    });

    const result = await executeCopilotTool({
      orgId: org.id,
      userId: "user_1",
      actorRole: "accountant",
      toolName: "apply_recode_documents",
      rawInput: {
        query: "LOCKED-COPILOT",
        targetAccountCode: "6810",
        confirmationText: "APPLY RECODE",
        limit: 10,
      },
    });

    expect("summary" in result.output ? result.output.summary : {}).toMatchObject({
      targetAccountCode: "6810",
      updatedLineCount: 0,
      updatedDocumentCount: 0,
      skippedNonDraftCount: 0,
      skippedLockedPeriodCount: 1,
    });
    const [line] = await testDb
      .select({ accountCode: schema.documentLineItems.accountCode })
      .from(schema.documentLineItems)
      .where(sql`${schema.documentLineItems.documentId} = ${draftDoc.id}`);
    expect(line.accountCode).toBe("6110");
  });

  it("creates accountant review tasks as audited write tool events", async () => {
    const org = await createTestOrg(testDb);
    const result = await executeCopilotTool({
      orgId: org.id,
      userId: "user_1",
      actorRole: "accountant",
      toolName: "create_accountant_review_task",
      rawInput: { summary: "Review supplier VAT treatment", severity: "p2" },
    });

    expect("summary" in result.output ? result.output.summary : {}).toMatchObject({
      severity: "p2",
      summary: "Review supplier VAT treatment",
    });
    const [task] = await testDb.select().from(schema.exceptionQueue);
    expect(task).toMatchObject({
      orgId: org.id,
      exceptionType: "copilot_accountant_review_task",
      summary: "Review supplier VAT treatment",
    });
    const [event] = await testDb
      .select()
      .from(schema.copilotToolEvents)
      .where(sql`${schema.copilotToolEvents.toolName} = 'create_accountant_review_task'`);
    expect(event.risk).toBe("write");
    expect(event.status).toBe("succeeded");
  });
});
