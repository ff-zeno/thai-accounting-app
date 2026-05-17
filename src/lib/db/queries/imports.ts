import { and, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { ensureHeadOfficeEstablishment } from "./pos-sales-ledger";
import { db, type DbConnection } from "../index";
import {
  auditLog,
  documents,
  establishments,
  importChargeLines,
  importDocuments,
  importGoodsLines,
  importPackets,
  importPayments,
  inventoryMovements,
  journalEntries,
  periodLocks,
  postingExceptions,
  postingOutbox,
  skus,
  transactions,
  vendors,
} from "../schema";
import { orgScope } from "../helpers/org-scope";
import { recordInventoryMovementInTx } from "./inventory";
import {
  postImportBrokerChargeJournalEntries,
  postImportPaymentJournalEntry,
  reverseJournalEntryInTx,
} from "./general-ledger";
import { assertPostingDateOpenForGl, enqueuePostingOutbox } from "./posting-outbox";

function clearancePeriod(dateValue: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateValue)) {
    throw new Error("Import customs clearance date is invalid");
  }
  return {
    periodYear: Number(dateValue.slice(0, 4)),
    periodMonth: Number(dateValue.slice(5, 7)),
    vatPeriodOverride: dateValue.slice(0, 7),
    movementAt: new Date(`${dateValue}T12:00:00+07:00`),
  };
}

function assertPositiveMoney(value: string, label: string) {
  if (Number(value) <= 0) throw new Error(`${label} must be greater than zero`);
}

function moneyValue(value: string | undefined) {
  return Number(value ?? "0");
}

async function writeImportAuditLog(
  conn: DbConnection,
  data: {
    orgId: string;
    importId: string;
    operation: string;
    action?: "create" | "update" | "delete" | "void";
    actorId?: string;
    oldValue?: Record<string, unknown>;
    details?: Record<string, unknown>;
  }
) {
  await conn.insert(auditLog).values({
    orgId: data.orgId,
    entityType: "import_packet",
    entityId: data.importId,
    action: data.action ?? "create",
    actorId: data.actorId,
    oldValue: data.oldValue,
    newValue: {
      operation: data.operation,
      ...(data.details ?? {}),
    },
  });
}

async function assertImportPeriodUnlocked(
  conn: DbConnection,
  packet: {
    orgId: string;
    establishmentId: string;
    customsClearanceDate: string;
  }
) {
  const period = clearancePeriod(packet.customsClearanceDate);
  const locks = await conn
    .select({ id: periodLocks.id, domain: periodLocks.domain })
    .from(periodLocks)
    .where(
      and(
        eq(periodLocks.orgId, packet.orgId),
        isNull(periodLocks.unlockedAt),
        sql`${periodLocks.domain} IN ('vat', 'gl')`,
        eq(periodLocks.periodYear, period.periodYear),
        or(eq(periodLocks.periodMonth, period.periodMonth), isNull(periodLocks.periodMonth)),
        sql`(${periodLocks.establishmentId} IS NULL OR ${periodLocks.establishmentId} = ${packet.establishmentId})`
      )
    )
    .limit(1);

  if (locks.length > 0) {
    throw new Error(`Import customs clearance period is locked for ${locks[0].domain}`);
  }
}

async function getOpenImportPacketForMutation(
  conn: DbConnection,
  data: { orgId: string; importId: string }
) {
  const [packet] = await conn
    .select({
      id: importPackets.id,
      orgId: importPackets.orgId,
      establishmentId: importPackets.establishmentId,
      customsClearanceDate: importPackets.customsClearanceDate,
      isFinalized: importPackets.isFinalized,
    })
    .from(importPackets)
    .where(
      and(
        eq(importPackets.orgId, data.orgId),
        eq(importPackets.id, data.importId),
        isNull(importPackets.deletedAt)
      )
    )
    .for("update")
    .limit(1);

  if (!packet) throw new Error("Import packet not found");
  if (packet.isFinalized) throw new Error("Finalized import packets cannot be edited");
  await assertImportPeriodUnlocked(conn, packet);
  return packet;
}

export async function getImportsWorkflowDashboard(orgId: string) {
  await ensureHeadOfficeEstablishment(orgId);

  const [summary] = await db
    .select({
      packetCount: sql<number>`COUNT(*)::int`,
      openCount: sql<number>`COUNT(*) FILTER (WHERE ${importPackets.isFinalized} = false)::int`,
      finalizedCount: sql<number>`COUNT(*) FILTER (WHERE ${importPackets.isFinalized} = true)::int`,
      assessedImportVat: sql<string>`COALESCE(SUM(${importPackets.customsAssessedImportVatThb}), 0)::numeric(14,2)`,
      assessedDuty: sql<string>`COALESCE(SUM(${importPackets.customsAssessedDutyThb}), 0)::numeric(14,2)`,
    })
    .from(importPackets)
    .where(and(...orgScope(importPackets, orgId)));

  const [chargeSummary] = await db
    .select({
      importVatLines: sql<string>`COALESCE(SUM(CASE WHEN ${importChargeLines.vatTreatment} = 'is_import_vat' THEN ${importChargeLines.amountThb} ELSE 0 END), 0)::numeric(14,2)`,
      serviceVat: sql<string>`COALESCE(SUM(${importChargeLines.vatAmountThb}), 0)::numeric(14,2)`,
      passThroughCharges: sql<string>`COALESCE(SUM(CASE WHEN ${importChargeLines.vatTreatment} IN ('is_pass_through', 'excise_pass_through') THEN ${importChargeLines.amountThb} ELSE 0 END), 0)::numeric(14,2)`,
    })
    .from(importChargeLines)
    .where(eq(importChargeLines.orgId, orgId));

  const recentPackets = await db
    .select({
      id: importPackets.id,
      importReference: importPackets.importReference,
      customsDeclarationNumber: importPackets.customsDeclarationNumber,
      customsClearanceDate: importPackets.customsClearanceDate,
      originalCurrency: importPackets.originalCurrency,
      fxRateAtClearance: importPackets.fxRateAtClearance,
      customsAssessedDutyThb: importPackets.customsAssessedDutyThb,
      customsAssessedImportVatThb: importPackets.customsAssessedImportVatThb,
      isFinalized: importPackets.isFinalized,
      finalizedAt: importPackets.finalizedAt,
      branchNumber: establishments.branchNumber,
      supplierName: vendors.name,
    })
    .from(importPackets)
    .innerJoin(establishments, eq(establishments.id, importPackets.establishmentId))
    .leftJoin(vendors, eq(vendors.id, importPackets.supplierVendorId))
    .where(and(...orgScope(importPackets, orgId)))
    .orderBy(desc(importPackets.customsClearanceDate), desc(importPackets.createdAt))
    .limit(20);

  const openAgingPackets = await db
    .select({
      id: importPackets.id,
      importReference: importPackets.importReference,
      customsDeclarationNumber: importPackets.customsDeclarationNumber,
      customsClearanceDate: importPackets.customsClearanceDate,
      supplierName: vendors.name,
      daysOpen: sql<number>`GREATEST((CURRENT_DATE - ${importPackets.customsClearanceDate}), 0)::int`,
      linkedDocumentCount: sql<number>`(
        SELECT COUNT(*)::int
        FROM ${importDocuments}
        WHERE ${importDocuments.orgId} = ${importPackets.orgId}
          AND ${importDocuments.importId} = ${importPackets.id}
      )`,
      brokerChargeLineCount: sql<number>`(
        SELECT COUNT(*)::int
        FROM ${importChargeLines}
        WHERE ${importChargeLines.orgId} = ${importPackets.orgId}
          AND ${importChargeLines.importId} = ${importPackets.id}
      )`,
      paymentCount: sql<number>`(
        SELECT COUNT(*)::int
        FROM ${importPayments}
        WHERE ${importPayments.orgId} = ${importPackets.orgId}
          AND ${importPayments.importId} = ${importPackets.id}
      )`,
    })
    .from(importPackets)
    .leftJoin(vendors, eq(vendors.id, importPackets.supplierVendorId))
    .where(
      and(
        ...orgScope(importPackets, orgId),
        eq(importPackets.isFinalized, false)
      )
    )
    .orderBy(importPackets.customsClearanceDate, importPackets.createdAt)
    .limit(10);

  return {
    summary,
    chargeSummary,
    recentPackets,
    openAgingPackets,
  };
}

export async function getImportPacketDetail(orgId: string, importId: string) {
  const [packet] = await db
    .select({
      id: importPackets.id,
      importReference: importPackets.importReference,
      customsDeclarationNumber: importPackets.customsDeclarationNumber,
      arrivalPort: importPackets.arrivalPort,
      arrivalDate: importPackets.arrivalDate,
      customsClearanceDate: importPackets.customsClearanceDate,
      originalCurrency: importPackets.originalCurrency,
      fxRateAtClearance: importPackets.fxRateAtClearance,
      cifOriginal: importPackets.cifOriginal,
      cifThb: importPackets.cifThb,
      customsAssessedDutyThb: importPackets.customsAssessedDutyThb,
      customsAssessedExciseThb: importPackets.customsAssessedExciseThb,
      customsAssessedImportVatThb: importPackets.customsAssessedImportVatThb,
      isFinalized: importPackets.isFinalized,
      finalizedAt: importPackets.finalizedAt,
      notes: importPackets.notes,
      branchNumber: establishments.branchNumber,
      supplierName: vendors.name,
    })
    .from(importPackets)
    .innerJoin(establishments, eq(establishments.id, importPackets.establishmentId))
    .leftJoin(vendors, eq(vendors.id, importPackets.supplierVendorId))
    .where(
      and(
        eq(importPackets.orgId, orgId),
        isNull(importPackets.deletedAt),
        eq(importPackets.id, importId)
      )
    )
    .limit(1);

  if (!packet) return null;

  const [
    linkedDocuments,
    goodsLines,
    chargeLines,
    payments,
    paymentCandidates,
    auditRows,
    glAuditRows,
  ] = await Promise.all([
    db
      .select({
        id: importDocuments.id,
        documentId: importDocuments.documentId,
        documentRole: importDocuments.documentRole,
        notes: importDocuments.notes,
        createdAt: importDocuments.createdAt,
        documentNumber: documents.documentNumber,
        documentType: documents.type,
      })
      .from(importDocuments)
      .innerJoin(
        documents,
        and(
          eq(documents.id, importDocuments.documentId),
          eq(documents.orgId, importDocuments.orgId)
        )
      )
      .where(and(eq(importDocuments.orgId, orgId), eq(importDocuments.importId, importId))),
    db
      .select()
      .from(importGoodsLines)
      .where(and(eq(importGoodsLines.orgId, orgId), eq(importGoodsLines.importId, importId))),
    db
      .select()
      .from(importChargeLines)
      .where(and(eq(importChargeLines.orgId, orgId), eq(importChargeLines.importId, importId))),
    db
      .select()
      .from(importPayments)
      .where(and(eq(importPayments.orgId, orgId), eq(importPayments.importId, importId))),
    db
      .select({
        id: transactions.id,
        date: transactions.date,
        description: transactions.description,
        amount: transactions.amount,
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.orgId, orgId),
          eq(transactions.type, "debit"),
          eq(transactions.reconciliationStatus, "unmatched"),
          isNull(transactions.deletedAt)
        )
      )
      .orderBy(desc(transactions.date), desc(transactions.createdAt))
      .limit(20),
    db
      .select({
        id: auditLog.id,
        entityId: auditLog.entityId,
        createdAt: auditLog.createdAt,
        action: auditLog.action,
        newValue: auditLog.newValue,
      })
      .from(auditLog)
      .where(
        and(
          eq(auditLog.orgId, orgId),
          eq(auditLog.entityType, "import_packet"),
          eq(auditLog.entityId, importId)
        )
      ),
    db
      .select({
        id: auditLog.id,
        entityId: auditLog.entityId,
        createdAt: auditLog.createdAt,
        action: auditLog.action,
        newValue: auditLog.newValue,
      })
      .from(auditLog)
      .where(
        and(
          eq(auditLog.orgId, orgId),
          eq(auditLog.entityType, "journal_entry"),
          sql`${auditLog.newValue}->>'importId' = ${importId}`
        )
      ),
  ]);

  const auditTrail = [
    ...linkedDocuments.map((doc) => ({
      id: doc.id,
      occurredAt: doc.createdAt,
      eventType: "document",
      label: doc.documentRole,
      detail: doc.documentNumber ?? doc.notes ?? doc.documentId,
      amount: null as string | null,
    })),
    ...chargeLines.map((line) => ({
      id: line.id,
      occurredAt: line.createdAt,
      eventType: "charge",
      label: line.vatTreatment,
      detail: line.lineDescription,
      amount: line.amountThb,
    })),
    ...payments.map((payment) => ({
      id: payment.id,
      occurredAt: payment.createdAt,
      eventType: "payment",
      label: payment.paymentRole,
      detail: payment.bankTransactionId,
      amount: payment.amountThb,
    })),
    ...auditRows.map((row) => {
      const value = row.newValue as { operation?: string } | null;
      return {
        id: row.id,
        occurredAt: row.createdAt,
        eventType: "audit",
        label: row.action,
        detail: value?.operation ?? "import_packet_event",
        amount: null as string | null,
      };
    }),
    ...glAuditRows.map((row) => {
      const value = row.newValue as { operation?: string; amountThb?: string } | null;
      return {
        id: row.id,
        occurredAt: row.createdAt,
        eventType: "journal",
        label: value?.operation ?? "journal_entry",
        detail: row.entityId,
        amount: value?.amountThb ?? null,
      };
    }),
  ].sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());

  return {
    packet,
    documents: linkedDocuments,
    goodsLines,
    chargeLines,
    payments,
    paymentCandidates,
    auditTrail,
  };
}

export async function createManualImportPacket(data: {
  orgId: string;
  importReference: string;
  customsDeclarationNumber?: string;
  arrivalPort?: string;
  arrivalDate: string;
  customsClearanceDate: string;
  originalCurrency: string;
  fxRateAtClearance: string;
  customsAssessedDutyThb: string;
  customsAssessedExciseThb: string;
  customsAssessedImportVatThb: string;
  notes?: string;
}) {
  const establishment = await ensureHeadOfficeEstablishment(data.orgId);

  const row = await db.transaction(async (tx) => {
    const conn = tx as DbConnection;
    const [packet] = await conn
      .insert(importPackets)
      .values({
        orgId: data.orgId,
        establishmentId: establishment.id,
        importReference: data.importReference,
        customsDeclarationNumber: data.customsDeclarationNumber || null,
        arrivalPort: data.arrivalPort || null,
        arrivalDate: data.arrivalDate,
        customsClearanceDate: data.customsClearanceDate,
        originalCurrency: data.originalCurrency.toUpperCase(),
        fxRateAtClearance: data.fxRateAtClearance,
        customsAssessedDutyThb: data.customsAssessedDutyThb,
        customsAssessedExciseThb: data.customsAssessedExciseThb,
        customsAssessedImportVatThb: data.customsAssessedImportVatThb,
        notes: data.notes || null,
      })
      .returning();

    await writeImportAuditLog(conn, {
      orgId: data.orgId,
      importId: packet.id,
      operation: "create_import_packet",
    });

    return packet;
  });

  return row;
}

export async function updateOpenImportPacketHeader(data: {
  orgId: string;
  importId: string;
  importReference?: string;
  customsDeclarationNumber?: string;
  arrivalPort?: string;
  notes?: string;
}) {
  return db.transaction(async (tx) => {
    const conn = tx as DbConnection;
    const [packet] = await conn
      .select()
      .from(importPackets)
      .where(
        and(
          eq(importPackets.orgId, data.orgId),
          eq(importPackets.id, data.importId),
          isNull(importPackets.deletedAt)
        )
      )
      .for("update")
      .limit(1);

    if (!packet) throw new Error("Import packet not found");
    if (packet.isFinalized) throw new Error("Finalized import packets cannot be edited");
    await assertImportPeriodUnlocked(conn, packet);

    const [updated] = await conn
      .update(importPackets)
      .set({
        importReference: data.importReference || null,
        customsDeclarationNumber: data.customsDeclarationNumber || null,
        arrivalPort: data.arrivalPort || null,
        notes: data.notes || null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(importPackets.orgId, data.orgId),
          eq(importPackets.id, data.importId),
          isNull(importPackets.deletedAt)
        )
      )
      .returning();

    await writeImportAuditLog(conn, {
      orgId: data.orgId,
      importId: data.importId,
      operation: "update_import_packet_header",
      action: "update",
      details: {
        importReference: updated.importReference,
        customsDeclarationNumber: updated.customsDeclarationNumber,
      },
    });

    return updated;
  });
}

export async function deleteEmptyOpenImportPacket(data: {
  orgId: string;
  importId: string;
  deletedAt?: Date;
}) {
  return db.transaction(async (tx) => {
    const conn = tx as DbConnection;
    const [packet] = await conn
      .select()
      .from(importPackets)
      .where(
        and(
          eq(importPackets.orgId, data.orgId),
          eq(importPackets.id, data.importId),
          isNull(importPackets.deletedAt)
        )
      )
      .for("update")
      .limit(1);

    if (!packet) throw new Error("Import packet not found");
    if (packet.isFinalized) throw new Error("Finalized import packets cannot be deleted");

    const [childCounts] = await conn
      .select({
        documents: sql<number>`(
          SELECT COUNT(*)::int FROM ${importDocuments}
          WHERE ${importDocuments.orgId} = ${data.orgId}
            AND ${importDocuments.importId} = ${data.importId}
        )`,
        goods: sql<number>`(
          SELECT COUNT(*)::int FROM ${importGoodsLines}
          WHERE ${importGoodsLines.orgId} = ${data.orgId}
            AND ${importGoodsLines.importId} = ${data.importId}
        )`,
        charges: sql<number>`(
          SELECT COUNT(*)::int FROM ${importChargeLines}
          WHERE ${importChargeLines.orgId} = ${data.orgId}
            AND ${importChargeLines.importId} = ${data.importId}
        )`,
        payments: sql<number>`(
          SELECT COUNT(*)::int FROM ${importPayments}
          WHERE ${importPayments.orgId} = ${data.orgId}
            AND ${importPayments.importId} = ${data.importId}
        )`,
      })
      .from(importPackets)
      .where(
        and(
          eq(importPackets.orgId, data.orgId),
          eq(importPackets.id, data.importId)
        )
      )
      .limit(1);

    const childTotal =
      childCounts.documents + childCounts.goods + childCounts.charges + childCounts.payments;
    if (childTotal > 0) {
      throw new Error("Only empty open import packets can be deleted");
    }

    await writeImportAuditLog(conn, {
      orgId: data.orgId,
      importId: data.importId,
      operation: "delete_empty_import_packet",
      action: "delete",
      details: {
        importReference: packet.importReference,
        customsDeclarationNumber: packet.customsDeclarationNumber,
      },
    });

    const [deleted] = await conn
      .update(importPackets)
      .set({ deletedAt: data.deletedAt ?? new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(importPackets.orgId, data.orgId),
          eq(importPackets.id, data.importId),
          isNull(importPackets.deletedAt)
        )
      )
      .returning();

    return deleted;
  });
}

export async function deleteOpenImportGoodsLine(data: {
  orgId: string;
  importId: string;
  goodsLineId: string;
  actorId?: string;
}) {
  return db.transaction(async (tx) => {
    const conn = tx as DbConnection;
    await getOpenImportPacketForMutation(conn, data);

    const [deleted] = await conn
      .delete(importGoodsLines)
      .where(
        and(
          eq(importGoodsLines.orgId, data.orgId),
          eq(importGoodsLines.importId, data.importId),
          eq(importGoodsLines.id, data.goodsLineId)
        )
      )
      .returning();

    if (!deleted) throw new Error("Import goods line not found");

    await writeImportAuditLog(conn, {
      orgId: data.orgId,
      importId: data.importId,
      operation: "delete_import_goods_line",
      action: "delete",
      actorId: data.actorId,
      oldValue: deleted,
      details: { goodsLineId: data.goodsLineId, skuCode: deleted.skuCode },
    });

    return deleted;
  });
}

export async function deleteOpenImportChargeLine(data: {
  orgId: string;
  importId: string;
  chargeLineId: string;
  actorId?: string;
}) {
  return db.transaction(async (tx) => {
    const conn = tx as DbConnection;
    await getOpenImportPacketForMutation(conn, data);

    const [deleted] = await conn
      .delete(importChargeLines)
      .where(
        and(
          eq(importChargeLines.orgId, data.orgId),
          eq(importChargeLines.importId, data.importId),
          eq(importChargeLines.id, data.chargeLineId)
        )
      )
      .returning();

    if (!deleted) throw new Error("Import charge line not found");

    const [remainingDocumentCharge] = await conn
      .select({ id: importChargeLines.id })
      .from(importChargeLines)
      .where(
        and(
          eq(importChargeLines.orgId, data.orgId),
          eq(importChargeLines.importId, data.importId),
          eq(importChargeLines.sourceDocumentId, deleted.sourceDocumentId)
        )
      )
      .limit(1);
    if (!remainingDocumentCharge) {
      await conn
        .delete(importDocuments)
        .where(
          and(
            eq(importDocuments.orgId, data.orgId),
            eq(importDocuments.importId, data.importId),
            eq(importDocuments.documentId, deleted.sourceDocumentId)
          )
        );
      const [otherImportDocumentLink] = await conn
        .select({ id: importDocuments.id })
        .from(importDocuments)
        .where(
          and(
            eq(importDocuments.orgId, data.orgId),
            eq(importDocuments.documentId, deleted.sourceDocumentId)
          )
        )
        .limit(1);
      if (!otherImportDocumentLink) {
        await conn
          .update(documents)
          .set({ deletedAt: new Date(), updatedAt: new Date() })
          .where(
            and(
              eq(documents.orgId, data.orgId),
              eq(documents.id, deleted.sourceDocumentId),
              eq(documents.status, "draft"),
              isNull(documents.deletedAt)
            )
          );
      }
    }

    await writeImportAuditLog(conn, {
      orgId: data.orgId,
      importId: data.importId,
      operation: "delete_import_charge_line",
      action: "delete",
      actorId: data.actorId,
      oldValue: deleted,
      details: {
        chargeLineId: data.chargeLineId,
        vatTreatment: deleted.vatTreatment,
        amountThb: deleted.amountThb,
      },
    });

    return deleted;
  });
}

export async function deleteOpenImportDocumentLink(data: {
  orgId: string;
  importId: string;
  importDocumentId: string;
  actorId?: string;
}) {
  return db.transaction(async (tx) => {
    const conn = tx as DbConnection;
    await getOpenImportPacketForMutation(conn, data);

    const [link] = await conn
      .select()
      .from(importDocuments)
      .where(
        and(
          eq(importDocuments.orgId, data.orgId),
          eq(importDocuments.importId, data.importId),
          eq(importDocuments.id, data.importDocumentId)
        )
      )
      .for("update")
      .limit(1);

    if (!link) throw new Error("Import document link not found");

    const [chargeReference] = await conn
      .select({ id: importChargeLines.id })
      .from(importChargeLines)
      .where(
        and(
          eq(importChargeLines.orgId, data.orgId),
          eq(importChargeLines.importId, data.importId),
          eq(importChargeLines.sourceDocumentId, link.documentId)
        )
      )
      .limit(1);
    if (chargeReference) {
      throw new Error("Import document is still used by a charge line");
    }

    const [deleted] = await conn
      .delete(importDocuments)
      .where(
        and(
          eq(importDocuments.orgId, data.orgId),
          eq(importDocuments.importId, data.importId),
          eq(importDocuments.id, data.importDocumentId)
        )
      )
      .returning();

    const [otherImportDocumentLink] = await conn
      .select({ id: importDocuments.id })
      .from(importDocuments)
      .where(
        and(
          eq(importDocuments.orgId, data.orgId),
          eq(importDocuments.documentId, link.documentId)
        )
      )
      .limit(1);
    if (!otherImportDocumentLink) {
      await conn
        .update(documents)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(
          and(
            eq(documents.orgId, data.orgId),
            eq(documents.id, link.documentId),
            eq(documents.status, "draft"),
            isNull(documents.deletedAt)
          )
        );
    }

    await writeImportAuditLog(conn, {
      orgId: data.orgId,
      importId: data.importId,
      operation: "delete_import_document_link",
      action: "delete",
      actorId: data.actorId,
      oldValue: deleted,
      details: {
        importDocumentId: data.importDocumentId,
        documentId: link.documentId,
        documentRole: link.documentRole,
      },
    });

    return deleted;
  });
}

export async function deleteOpenImportPaymentLink(data: {
  orgId: string;
  importId: string;
  importPaymentId: string;
  actorId?: string;
}) {
  return db.transaction(async (tx) => {
    const conn = tx as DbConnection;
    await getOpenImportPacketForMutation(conn, data);

    const [payment] = await conn
      .select({
        id: importPayments.id,
        importId: importPayments.importId,
        bankTransactionId: importPayments.bankTransactionId,
        paymentRole: importPayments.paymentRole,
        amountThb: importPayments.amountThb,
        transactionDate: transactions.date,
      })
      .from(importPayments)
      .innerJoin(
        transactions,
        and(
          eq(transactions.orgId, importPayments.orgId),
          eq(transactions.id, importPayments.bankTransactionId)
        )
      )
      .where(
        and(
          eq(importPayments.orgId, data.orgId),
          eq(importPayments.importId, data.importId),
          eq(importPayments.id, data.importPaymentId),
          isNull(transactions.deletedAt)
        )
      )
      .for("update")
      .limit(1);

    if (!payment) throw new Error("Import payment link not found");

    const [entry] = await conn
      .select({
        id: journalEntries.id,
        reversedByEntryId: journalEntries.reversedByEntryId,
      })
      .from(journalEntries)
      .where(
        and(
          eq(journalEntries.orgId, data.orgId),
          eq(journalEntries.sourceEntityType, "import_payments"),
          eq(journalEntries.sourceEntityId, payment.id),
          eq(journalEntries.postingKind, "import_payment_clearing")
        )
      )
      .limit(1);

    let reversalId: string | null = null;
    if (entry && !entry.reversedByEntryId) {
      await assertPostingDateOpenForGl(conn, data.orgId, payment.transactionDate);
      const reversal = await reverseJournalEntryInTx(conn, {
        orgId: data.orgId,
        journalEntryId: entry.id,
        reversalDate: payment.transactionDate,
        createdByUserId: data.actorId,
        notes: `Reverse import payment link ${payment.id}`,
        clearSubledgerRefs: true,
      });
      reversalId = reversal.id;
    }

    const [deleted] = await conn
      .delete(importPayments)
      .where(
        and(
          eq(importPayments.orgId, data.orgId),
          eq(importPayments.importId, data.importId),
          eq(importPayments.id, data.importPaymentId)
        )
      )
      .returning();

    const outboxRows = await conn
      .select({ id: postingOutbox.id })
      .from(postingOutbox)
      .where(
        and(
          eq(postingOutbox.orgId, data.orgId),
          eq(postingOutbox.sourceEntityType, "import_payments"),
          eq(postingOutbox.sourceEntityId, payment.id),
          eq(postingOutbox.eventType, "create")
        )
      );

    const outboxIds = outboxRows.map((row) => row.id);
    if (outboxIds.length > 0) {
      await conn
        .delete(postingExceptions)
        .where(
          and(
            eq(postingExceptions.orgId, data.orgId),
            inArray(postingExceptions.postingOutboxId, outboxIds)
          )
        );

      await conn
        .delete(postingOutbox)
        .where(and(eq(postingOutbox.orgId, data.orgId), inArray(postingOutbox.id, outboxIds)));
    }

    await conn
      .update(transactions)
      .set({ reconciliationStatus: "unmatched" })
      .where(
        and(
          eq(transactions.orgId, data.orgId),
          eq(transactions.id, payment.bankTransactionId)
        )
      );

    await writeImportAuditLog(conn, {
      orgId: data.orgId,
      importId: data.importId,
      operation: "delete_import_payment_link",
      action: "delete",
      actorId: data.actorId,
      oldValue: deleted,
      details: {
        importPaymentId: data.importPaymentId,
        bankTransactionId: payment.bankTransactionId,
        paymentRole: payment.paymentRole,
        amountThb: payment.amountThb,
        reversalJournalEntryId: reversalId,
      },
    });

    return deleted;
  });
}

function toFour(value: number) {
  return value.toFixed(4);
}

function deriveImportUnitCostThb(
  line: {
    quantity: string;
    unitPriceOriginal: string;
    goodsValueThb: string | null;
  },
  fxRateAtClearance: string
) {
  const quantity = Number(line.quantity);
  if (quantity <= 0) throw new Error("Import goods line quantity must be positive");

  if (line.goodsValueThb != null) {
    return toFour(Number(line.goodsValueThb) / quantity);
  }

  return toFour(Number(line.unitPriceOriginal) * Number(fxRateAtClearance));
}

export async function finalizeImportPacketToInventory(data: {
  orgId: string;
  importId: string;
  finalizedAt?: Date;
}) {
  return db.transaction(async (tx) => {
    const conn = tx as DbConnection;
    const finalizedAt = data.finalizedAt ?? new Date();
    const [packet] = await conn
      .select()
      .from(importPackets)
      .where(
        and(
          eq(importPackets.orgId, data.orgId),
          isNull(importPackets.deletedAt),
          eq(importPackets.id, data.importId)
        )
      )
      .for("update")
      .limit(1);

    if (!packet) throw new Error("Import packet not found");
    if (packet.isFinalized) throw new Error("Import packet is already finalized");
    await assertImportPeriodUnlocked(conn, packet);

    const goodsLines = await conn
      .select()
      .from(importGoodsLines)
      .where(
        and(
          eq(importGoodsLines.orgId, data.orgId),
          eq(importGoodsLines.importId, data.importId)
        )
      );

    if (goodsLines.length === 0) {
      throw new Error("Cannot finalize import without goods lines");
    }

    const [importVatSummary] = await conn
      .select({
        total: sql<string>`COALESCE(SUM(${importChargeLines.amountThb}), 0)::numeric(14,2)::text`,
        diff: sql<string>`ABS(COALESCE(SUM(${importChargeLines.amountThb}), 0)::numeric(14,2) - ${packet.customsAssessedImportVatThb}::numeric(14,2))::numeric(14,2)::text`,
      })
      .from(importChargeLines)
      .where(
        and(
          eq(importChargeLines.orgId, data.orgId),
          eq(importChargeLines.importId, data.importId),
          eq(importChargeLines.vatTreatment, "is_import_vat")
        )
      );

    if (Number(importVatSummary.diff) > 0) {
      throw new Error(
        `Import VAT charge total ${importVatSummary.total} does not match customs assessment ${packet.customsAssessedImportVatThb}`
      );
    }

    const clearance = clearancePeriod(packet.customsClearanceDate);

    const movementIds: string[] = [];
    for (const line of goodsLines) {
      const unitCost = deriveImportUnitCostThb(line, packet.fxRateAtClearance);
      const [existingSku] = await conn
        .select()
        .from(skus)
        .where(
          and(
            eq(skus.orgId, data.orgId),
            isNull(skus.deletedAt),
            eq(skus.skuCode, line.skuCode)
          )
        )
        .for("update")
        .limit(1);

      const sku =
        existingSku ??
        (
          await conn
            .insert(skus)
            .values({
              orgId: data.orgId,
              skuCode: line.skuCode,
              nameEn: line.description,
              standardCost: unitCost,
            })
            .returning()
        )[0];

      const movement = await recordInventoryMovementInTx(
        {
          orgId: data.orgId,
          establishmentId: packet.establishmentId,
          skuId: sku.id,
          movementAt: clearance.movementAt,
          movementType: "import_in",
          quantity: line.quantity,
          unitCost,
          sourceEntityType: "import_goods_lines",
          sourceEntityId: line.id,
          notes: `Import ${packet.importReference ?? packet.customsDeclarationNumber ?? packet.id}`,
        },
        conn
      );
      movementIds.push(movement.id);
    }
    const brokerEntries = await postImportBrokerChargeJournalEntries({
      tx: conn,
      orgId: data.orgId,
      importId: data.importId,
      entryDate: packet.customsClearanceDate,
    });
    const brokerSourceDocuments = await conn
      .select({ sourceDocumentId: importChargeLines.sourceDocumentId })
      .from(importChargeLines)
      .where(
        and(
          eq(importChargeLines.orgId, data.orgId),
          eq(importChargeLines.importId, data.importId)
        )
      )
      .groupBy(importChargeLines.sourceDocumentId);
    for (const source of brokerSourceDocuments) {
      await enqueuePostingOutbox({
        tx: conn,
        orgId: data.orgId,
        sourceEntityType: "import_charge_documents",
        sourceEntityId: source.sourceDocumentId,
        eventType: "create",
        postingDate: packet.customsClearanceDate,
        payload: {
          importId: data.importId,
          customsClearanceDate: packet.customsClearanceDate,
        },
      });
    }

    const [finalized] = await conn
      .update(importPackets)
      .set({
        isFinalized: true,
        finalizedAt,
        updatedAt: new Date(),
      })
      .where(eq(importPackets.id, data.importId))
      .returning();

    await writeImportAuditLog(conn, {
      orgId: data.orgId,
      importId: data.importId,
      operation: "finalize_import_packet",
      action: "update",
      details: {
        movementCount: movementIds.length,
        brokerJournalEntryCount: brokerEntries.length,
        customsClearanceDate: packet.customsClearanceDate,
      },
    });

    const createdInventoryMovements =
      movementIds.length === 0
        ? []
        : await conn
            .select()
            .from(inventoryMovements)
            .where(
              and(
                eq(inventoryMovements.orgId, data.orgId),
                inArray(inventoryMovements.id, movementIds)
              )
            );

    return {
      importPacket: finalized,
      movementCount: movementIds.length,
      createdInventoryMovements,
    };
  });
}

export async function addImportGoodsLine(data: {
  orgId: string;
  importId: string;
  skuCode: string;
  description?: string;
  quantity: string;
  unitPriceOriginal: string;
  goodsValueOriginal?: string;
  goodsValueThb?: string;
}) {
  const row = await db.transaction(async (tx) => {
    const conn = tx as DbConnection;
    await getOpenImportPacketForMutation(conn, data);
    const [line] = await conn
      .insert(importGoodsLines)
      .values({
        orgId: data.orgId,
        importId: data.importId,
        skuCode: data.skuCode,
        description: data.description || null,
        quantity: data.quantity,
        unitPriceOriginal: data.unitPriceOriginal,
        goodsValueOriginal: data.goodsValueOriginal || null,
        goodsValueThb: data.goodsValueThb || null,
      })
      .returning();

    await writeImportAuditLog(conn, {
      orgId: data.orgId,
      importId: data.importId,
      operation: "add_import_goods_line",
      details: { skuCode: data.skuCode, quantity: data.quantity },
    });

    return line;
  });

  return row;
}

export async function addManualImportVatChargeLine(data: {
  orgId: string;
  importId: string;
  lineDescription: string;
  amountThb: string;
  documentNumber?: string;
}) {
  assertPositiveMoney(data.amountThb, "Import VAT amount");
  return db.transaction(async (tx) => {
    const conn = tx as DbConnection;
    const packet = await getOpenImportPacketForMutation(conn, data);

    const [existingImportVat] = await conn
      .select({ id: importChargeLines.id })
      .from(importChargeLines)
      .where(
        and(
          eq(importChargeLines.orgId, data.orgId),
          eq(importChargeLines.importId, data.importId),
          eq(importChargeLines.vatTreatment, "is_import_vat")
        )
      )
      .limit(1);
    if (existingImportVat) {
      throw new Error("Import packet already has an import VAT line");
    }

    const period = clearancePeriod(packet.customsClearanceDate);
    const [doc] = await conn
      .insert(documents)
      .values({
        orgId: data.orgId,
        direction: "expense",
        type: "invoice",
        status: "draft",
        documentNumber: data.documentNumber || null,
      })
      .returning();

    await conn
      .insert(importDocuments)
      .values({
        orgId: data.orgId,
        importId: data.importId,
        documentId: doc.id,
        documentRole: "customs_declaration",
      })
      .onConflictDoNothing();

    const [charge] = await conn
      .insert(importChargeLines)
      .values({
        orgId: data.orgId,
        importId: data.importId,
        sourceDocumentId: doc.id,
        lineDescription: data.lineDescription,
        amountThb: data.amountThb,
        originalAmount: data.amountThb,
        vatTreatment: "is_import_vat",
        vatPeriodOverride: period.vatPeriodOverride,
      })
      .returning();

    await writeImportAuditLog(conn, {
      orgId: data.orgId,
      importId: data.importId,
      operation: "add_import_vat_charge_line",
      details: { amountThb: data.amountThb, vatPeriodOverride: period.vatPeriodOverride },
    });

    return charge;
  });
}

export async function addManualImportChargeLine(data: {
  orgId: string;
  importId: string;
  documentRole?: string;
  documentNumber?: string;
  lineDescription: string;
  amountThb: string;
  vatTreatment: string;
  vatAmountThb?: string;
}) {
  assertPositiveMoney(data.amountThb, "Import charge amount");
  if (
    data.vatTreatment !== "service_with_vat_pct" &&
    moneyValue(data.vatAmountThb) > 0
  ) {
    throw new Error("Only service-with-VAT import charge lines may carry VAT amount");
  }
  return db.transaction(async (tx) => {
    const conn = tx as DbConnection;
    await getOpenImportPacketForMutation(conn, data);
    const [doc] = await conn
      .insert(documents)
      .values({
        orgId: data.orgId,
        direction: "expense",
        type: "invoice",
        status: "draft",
        documentNumber: data.documentNumber || null,
      })
      .returning();

    await conn
      .insert(importDocuments)
      .values({
        orgId: data.orgId,
        importId: data.importId,
        documentId: doc.id,
        documentRole: data.documentRole || "broker_invoice",
      })
      .onConflictDoNothing();

    const [charge] = await conn
      .insert(importChargeLines)
      .values({
        orgId: data.orgId,
        importId: data.importId,
        sourceDocumentId: doc.id,
        lineDescription: data.lineDescription,
        amountThb: data.amountThb,
        originalAmount: data.amountThb,
        vatTreatment: data.vatTreatment,
        vatAmountThb: data.vatAmountThb || "0.00",
      })
      .returning();

    await writeImportAuditLog(conn, {
      orgId: data.orgId,
      importId: data.importId,
      operation: "add_import_charge_line",
      details: {
        amountThb: data.amountThb,
        vatTreatment: data.vatTreatment,
      },
    });

    return charge;
  });
}

export async function linkImportDocument(data: {
  orgId: string;
  importId: string;
  documentRole: string;
  documentNumber?: string;
  notes?: string;
}) {
  return db.transaction(async (tx) => {
    const conn = tx as DbConnection;
    await getOpenImportPacketForMutation(conn, data);

    const [doc] = await conn
      .insert(documents)
      .values({
        orgId: data.orgId,
        direction: "expense",
        type: "invoice",
        status: "draft",
        documentNumber: data.documentNumber || null,
      })
      .returning();

    const [link] = await conn
      .insert(importDocuments)
      .values({
        orgId: data.orgId,
        importId: data.importId,
        documentId: doc.id,
        documentRole: data.documentRole,
        notes: data.notes || null,
      })
      .returning();

    await writeImportAuditLog(conn, {
      orgId: data.orgId,
      importId: data.importId,
      operation: "link_import_document",
      action: "update",
      details: { documentRole: data.documentRole, documentId: doc.id },
    });

    return { document: doc, link };
  });
}

export async function linkImportPayment(data: {
  orgId: string;
  importId: string;
  bankTransactionId: string;
  paymentRole: string;
  amountThb: string;
}) {
  assertPositiveMoney(data.amountThb, "Import payment amount");
  const row = await db.transaction(async (tx) => {
    const conn = tx as DbConnection;
    await getOpenImportPacketForMutation(conn, data);

    const [bankTransaction] = await conn
      .select({
        id: transactions.id,
        date: transactions.date,
        amount: transactions.amount,
        type: transactions.type,
        reconciliationStatus: transactions.reconciliationStatus,
        amountMatches: sql<boolean>`ABS(${transactions.amount}) = ${data.amountThb}::numeric(14,2)`,
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.orgId, data.orgId),
          eq(transactions.id, data.bankTransactionId),
          isNull(transactions.deletedAt)
        )
      )
      .for("update")
      .limit(1);

    if (!bankTransaction) throw new Error("Bank transaction not found");
    if (bankTransaction.type !== "debit") {
      throw new Error("Import payment must link to a debit bank transaction");
    }
    if (bankTransaction.reconciliationStatus !== "unmatched") {
      throw new Error("Import payment must link to an unmatched bank transaction");
    }
    if (!bankTransaction.amountMatches) {
      throw new Error("Import payment amount must match the linked bank transaction");
    }

    const [payment] = await conn
      .insert(importPayments)
      .values({
        orgId: data.orgId,
        importId: data.importId,
        bankTransactionId: data.bankTransactionId,
        paymentRole: data.paymentRole,
        amountThb: data.amountThb,
      })
      .returning();

    const paymentJournalEntry = await postImportPaymentJournalEntry({
      tx: conn,
      orgId: data.orgId,
      paymentId: payment.id,
    });
    const postingDate = bankTransaction.date;
    await enqueuePostingOutbox({
      tx: conn,
      orgId: data.orgId,
      sourceEntityType: "import_payments",
      sourceEntityId: payment.id,
      eventType: "create",
      postingDate,
      payload: {
        paymentRole: data.paymentRole,
        bankTransactionId: data.bankTransactionId,
        amountThb: data.amountThb,
      },
    });

    await conn
      .update(transactions)
      .set({ reconciliationStatus: "matched" })
      .where(
        and(
          eq(transactions.orgId, data.orgId),
          eq(transactions.id, data.bankTransactionId)
        )
      );

    await writeImportAuditLog(conn, {
      orgId: data.orgId,
      importId: data.importId,
      operation: "link_import_payment",
      action: "update",
      details: {
        bankTransactionId: data.bankTransactionId,
        amountThb: data.amountThb,
        journalEntryId: paymentJournalEntry?.id ?? null,
      },
    });

    return payment;
  });

  return row;
}
