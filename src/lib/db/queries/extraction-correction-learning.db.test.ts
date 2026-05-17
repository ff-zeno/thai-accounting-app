import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import {
  createTestDb,
  migrateTestDb,
  resetTestDb,
  createTestOrg,
  createTestVendor,
  createTestDocument,
} from "@/tests/db-test-utils";
import * as schema from "@/lib/db/schema";

const { db: testDb, pool } = createTestDb();

vi.mock("@/lib/db/index", () => ({ db: testDb }));
vi.mock("@/lib/db/helpers/audit-log", () => ({
  auditMutation: vi.fn(),
}));

const { insertExtractionLog } = await import("@/lib/db/queries/extraction-log");
const {
  upsertDraftCorrectionSession,
  confirmLatestCorrectionSessionForDocument,
  getCorrectionSessionByDocument,
  getCorrectionSessionByExtractionLog,
} = await import("@/lib/db/queries/extraction-correction-sessions");
const {
  upsertLearningCandidate,
  getCandidatesByCorrectionSession,
  getActiveLearningCandidates,
  promoteCandidatesForConfirmedSession,
  activateValidatedLearningCandidates,
} = await import("@/lib/db/queries/extraction-learning-candidates");

beforeAll(async () => {
  await resetTestDb(pool);
  await migrateTestDb(pool);
});

afterAll(async () => {
  await resetTestDb(pool);
  await pool.end();
});

beforeEach(async () => {
  await testDb.delete(schema.extractionLearningCandidates);
  await testDb.delete(schema.extractionReviewOutcome);
  await testDb.delete(schema.extractionCorrectionSessions);
  await testDb.delete(schema.extractionLog);
  await testDb.delete(schema.documents);
  await testDb.delete(schema.vendors);
  await testDb.delete(schema.organizations);
});

describe("extraction correction learning", () => {
  it("records a draft correction session idempotently and confirms it at document confirmation", async () => {
    const org = await createTestOrg(testDb);
    const vendor = await createTestVendor(testDb, org.id);
    const doc = await createTestDocument(testDb, org.id, vendor.id);
    const log = await insertExtractionLog({
      documentId: doc.id,
      orgId: org.id,
      vendorId: vendor.id,
      tierUsed: 0,
      exemplarIds: [],
      modelUsed: "qwen/qwen3-vl-32b-instruct",
      inngestIdempotencyKey: "correction-session-1",
    });

    const first = await upsertDraftCorrectionSession({
      orgId: org.id,
      documentId: doc.id,
      extractionLogId: log!.id,
      startedByUserId: "user_1",
      userExplanation: "The total should use GrandTotal.",
      aiInterpretation: { field: "totalAmount" },
    });

    const second = await upsertDraftCorrectionSession({
      orgId: org.id,
      documentId: doc.id,
      extractionLogId: log!.id,
      startedByUserId: "user_2",
      userExplanation: "Updated note",
      aiInterpretation: { field: "totalAmount", revised: true },
    });

    expect(second.id).toBe(first.id);
    expect(second.status).toBe("draft");
    expect(second.confirmedByUserId).toBeNull();
    expect(second.userExplanation).toBe("Updated note");

    const confirmed = await confirmLatestCorrectionSessionForDocument({
      orgId: org.id,
      documentId: doc.id,
      confirmedByUserId: "user_3",
    });
    expect(confirmed?.id).toBe(first.id);
    expect(confirmed?.status).toBe("confirmed");
    expect(confirmed?.confirmedByUserId).toBe("user_3");

    const byLog = await getCorrectionSessionByExtractionLog(org.id, log!.id);
    expect(byLog?.id).toBe(first.id);
    expect(byLog?.status).toBe("confirmed");

    const byDoc = await getCorrectionSessionByDocument(org.id, doc.id);
    expect(byDoc?.id).toBe(first.id);

    const afterResave = await upsertDraftCorrectionSession({
      orgId: org.id,
      documentId: doc.id,
      extractionLogId: log!.id,
      startedByUserId: "user_4",
      userExplanation: "late edit",
    });
    expect(afterResave.id).toBe(first.id);
    expect(afterResave.status).toBe("confirmed");
    expect(afterResave.confirmedByUserId).toBe("user_3");
  });

  it("stores candidate artifacts and only returns shadow/active guidance", async () => {
    const org = await createTestOrg(testDb);
    const vendor = await createTestVendor(testDb, org.id);
    const doc = await createTestDocument(testDb, org.id, vendor.id);
    const log = await insertExtractionLog({
      documentId: doc.id,
      orgId: org.id,
      vendorId: vendor.id,
      tierUsed: 0,
      exemplarIds: [],
      modelUsed: "qwen/qwen3-vl-32b-instruct",
      inngestIdempotencyKey: "candidate-1",
    });
    const session = await upsertDraftCorrectionSession({
      orgId: org.id,
      documentId: doc.id,
      extractionLogId: log!.id,
      startedByUserId: "user_1",
    });

    const candidate = await upsertLearningCandidate({
      orgId: org.id,
      documentId: doc.id,
      correctionSessionId: session.id,
      vendorId: vendor.id,
      vendorKey: vendor.taxId,
      documentFamily: "payment_processor_settlement_receipt",
      fieldName: "totalAmount",
      fieldCriticality: "high",
      candidateType: "field_rule",
      aiValue: "950.00",
      confirmedValue: "1000.00",
      rationale: "Use GrandTotal, not Credit Amount.",
      selectorHint: "GrandTotal",
      rejectHint: "Credit Amount",
      appliesWhen: ["contains Commission"],
      scope: "vendor_document_family",
      status: "candidate",
    });
    expect(candidate.id).toBeTruthy();

    const bySession = await getCandidatesByCorrectionSession(org.id, session.id);
    expect(bySession).toHaveLength(1);
    expect(bySession[0].fieldName).toBe("totalAmount");

    const activeBefore = await getActiveLearningCandidates({
      orgId: org.id,
      vendorId: vendor.id,
      documentFamily: "payment_processor_settlement_receipt",
    });
    expect(activeBefore).toHaveLength(0);

    await upsertLearningCandidate({
      orgId: org.id,
      documentId: doc.id,
      correctionSessionId: session.id,
      vendorId: vendor.id,
      vendorKey: vendor.taxId,
      documentFamily: "payment_processor_settlement_receipt",
      fieldName: "totalAmount",
      fieldCriticality: "high",
      candidateType: "field_rule",
      aiValue: "950.00",
      confirmedValue: "1000.00",
      scope: "vendor_document_family",
      status: "shadow",
    });

    const activeAfter = await getActiveLearningCandidates({
      orgId: org.id,
      vendorId: vendor.id,
      documentFamily: "payment_processor_settlement_receipt",
      includeShadow: true,
    });
    expect(activeAfter).toHaveLength(1);
    expect(activeAfter[0].status).toBe("shadow");
  });

  it("keeps confirmed candidates in shadow until scoped validation", async () => {
    const org = await createTestOrg(testDb);
    const vendor = await createTestVendor(testDb, org.id);
    const doc = await createTestDocument(testDb, org.id, vendor.id);
    const log = await insertExtractionLog({
      documentId: doc.id,
      orgId: org.id,
      vendorId: vendor.id,
      tierUsed: 0,
      exemplarIds: [],
      modelUsed: "qwen/qwen3-vl-32b-instruct",
      inngestIdempotencyKey: "candidate-promotion-1",
    });
    const session = await upsertDraftCorrectionSession({
      orgId: org.id,
      documentId: doc.id,
      extractionLogId: log!.id,
      startedByUserId: "user_1",
    });

    await upsertLearningCandidate({
      orgId: org.id,
      documentId: doc.id,
      correctionSessionId: session.id,
      vendorId: vendor.id,
      fieldName: "documentNumber",
      fieldCriticality: "medium",
      candidateType: "field_rule",
      aiValue: "A",
      confirmedValue: "B",
      scope: "vendor_document_family",
    });
    await upsertLearningCandidate({
      orgId: org.id,
      documentId: doc.id,
      correctionSessionId: session.id,
      vendorId: vendor.id,
      fieldName: "totalAmount",
      fieldCriticality: "high",
      candidateType: "field_rule",
      aiValue: "1.00",
      confirmedValue: "2.00",
      scope: "vendor_document_family",
    });

    const promoted = await promoteCandidatesForConfirmedSession({
      orgId: org.id,
      correctionSessionId: session.id,
    });
    expect(promoted).toEqual({ active: 0, shadow: 2 });

    const activeOnly = await getActiveLearningCandidates({
      orgId: org.id,
      vendorId: vendor.id,
    });
    expect(activeOnly).toHaveLength(0);

    const withShadow = await getActiveLearningCandidates({
      orgId: org.id,
      vendorId: vendor.id,
      includeShadow: true,
    });
    expect(withShadow).toHaveLength(2);
    expect(withShadow.every((candidate) => candidate.status === "shadow")).toBe(true);

    await upsertLearningCandidate({
      orgId: org.id,
      documentId: doc.id,
      correctionSessionId: session.id,
      vendorId: vendor.id,
      fieldName: "documentNumber",
      fieldCriticality: "medium",
      candidateType: "field_rule",
      aiValue: "A",
      confirmedValue: "C",
      scope: "vendor_document_family",
      status: "candidate",
    });

    const stillShadow = await getActiveLearningCandidates({
      orgId: org.id,
      vendorId: vendor.id,
      includeShadow: true,
    });
    expect(stillShadow.find((candidate) => candidate.fieldName === "documentNumber")?.status).toBe("shadow");
  });

  it("activates shadow candidates only after explicit scoped validation", async () => {
    const org = await createTestOrg(testDb);
    const vendor = await createTestVendor(testDb, org.id);
    const doc = await createTestDocument(testDb, org.id, vendor.id);
    const log = await insertExtractionLog({
      documentId: doc.id,
      orgId: org.id,
      vendorId: vendor.id,
      tierUsed: 0,
      exemplarIds: [],
      modelUsed: "qwen/qwen3-vl-32b-instruct",
      inngestIdempotencyKey: "candidate-activate-1",
    });
    const session = await upsertDraftCorrectionSession({
      orgId: org.id,
      documentId: doc.id,
      extractionLogId: log!.id,
      startedByUserId: "user_1",
    });

    const candidate = await upsertLearningCandidate({
      orgId: org.id,
      documentId: doc.id,
      correctionSessionId: session.id,
      vendorId: vendor.id,
      documentFamily: "payment_processor_settlement_receipt",
      fieldName: "totalAmount",
      fieldCriticality: "high",
      candidateType: "field_rule",
      aiValue: "950.00",
      confirmedValue: "1000.00",
      selectorHint: "GrandTotal",
      rejectHint: "Credit Amount",
      scope: "vendor_document_family",
      status: "candidate",
    });

    await promoteCandidatesForConfirmedSession({
      orgId: org.id,
      correctionSessionId: session.id,
    });

    expect(
      await getActiveLearningCandidates({
        orgId: org.id,
        vendorId: vendor.id,
      })
    ).toHaveLength(0);

    const activated = await activateValidatedLearningCandidates({
      orgId: org.id,
      candidateIds: [candidate.id],
      validatedByUserId: "accountant_1",
      validationEvidence: {
        validationType: "held_out_document",
        notes: "Replay extracted totalAmount from GrandTotal on one held-out Ksher PDF.",
        sampleDocumentIds: [doc.id],
      },
    });
    expect(activated).toBe(1);

    const active = await getActiveLearningCandidates({
      orgId: org.id,
      vendorId: vendor.id,
      documentFamily: "payment_processor_settlement_receipt",
    });
    expect(active).toHaveLength(1);
    expect(active[0].status).toBe("active");
    expect(active[0].promotionEvidence).toMatchObject({
      validationType: "held_out_document",
      validatedByUserId: "accountant_1",
    });
  });

  it("rejects cross-org correction session and candidate references", async () => {
    const orgA = await createTestOrg(testDb);
    const orgB = await createTestOrg(testDb);
    const vendorA = await createTestVendor(testDb, orgA.id);
    const vendorB = await createTestVendor(testDb, orgB.id);
    const docA = await createTestDocument(testDb, orgA.id, vendorA.id);
    const docB = await createTestDocument(testDb, orgB.id, vendorB.id);
    const logA = await insertExtractionLog({
      documentId: docA.id,
      orgId: orgA.id,
      vendorId: vendorA.id,
      tierUsed: 0,
      exemplarIds: [],
      modelUsed: "qwen/qwen3-vl-32b-instruct",
      inngestIdempotencyKey: "cross-org-log-a",
    });
    const sessionA = await upsertDraftCorrectionSession({
      orgId: orgA.id,
      documentId: docA.id,
      extractionLogId: logA!.id,
      startedByUserId: "user_1",
    });
    await upsertLearningCandidate({
      orgId: orgA.id,
      documentId: docA.id,
      correctionSessionId: sessionA.id,
      vendorId: vendorA.id,
      fieldName: "totalAmount",
      fieldCriticality: "high",
      candidateType: "field_exemplar",
      aiValue: "1.00",
      confirmedValue: "2.00",
      scope: "vendor_document_family",
    });

    await expect(
      upsertDraftCorrectionSession({
        orgId: orgB.id,
        documentId: docB.id,
        extractionLogId: logA!.id,
        startedByUserId: "user_2",
      })
    ).rejects.toThrow();

    await expect(
      upsertLearningCandidate({
        orgId: orgB.id,
        documentId: docB.id,
        correctionSessionId: sessionA.id,
        vendorId: vendorB.id,
        fieldName: "totalAmount",
        fieldCriticality: "high",
        candidateType: "field_exemplar",
        aiValue: "1.00",
        confirmedValue: "2.00",
        scope: "vendor_document_family",
      })
    ).rejects.toThrow();
  });
});
