import { and, eq, sql } from "drizzle-orm";
import { db } from "../index";
import {
  whtCertificates,
  whtCertificateItems,
  whtSequenceCounters,
  vendors,
  organizations,
  whtAnnualThresholdDecisions,
} from "../schema";
import { orgScope, orgScopeAlive } from "../helpers/org-scope";
import { auditMutation } from "../helpers/audit-log";
import { isPeriodLocked } from "./period-locks";

const WHT_ANNUAL_EXEMPTION_THRESHOLD = 1000;

// ---------------------------------------------------------------------------
// Form type determination
// ---------------------------------------------------------------------------

export type WhtFormType = "pnd3" | "pnd53" | "pnd54";

export function getFormTypeForEntity(
  entityType: "individual" | "company" | "foreign"
): WhtFormType {
  switch (entityType) {
    case "individual":
      return "pnd3";
    case "company":
      return "pnd53";
    case "foreign":
      return "pnd54";
  }
}

// ---------------------------------------------------------------------------
// Sequence allocation
// ---------------------------------------------------------------------------

const MAX_SEQUENCE_RETRIES = 5;

/**
 * Allocate the next WHT certificate sequence number for an org/form/year.
 *
 * Race-safe: uses optimistic locking with a retry loop. If the UPDATE finds
 * the expected nextSequence has already been taken, we re-read and try again.
 * The UNIQUE constraint on wht_sequence_counters prevents any gaps or dupes.
 */
export async function allocateSequenceNumber(
  orgId: string,
  formType: WhtFormType,
  year: number
): Promise<number> {
  for (let attempt = 0; attempt < MAX_SEQUENCE_RETRIES; attempt++) {
    // Try to read existing counter
    const existing = await db
      .select({ id: whtSequenceCounters.id, nextSequence: whtSequenceCounters.nextSequence })
      .from(whtSequenceCounters)
      .where(
        and(
          ...orgScopeAlive(whtSequenceCounters, orgId),
          eq(whtSequenceCounters.formType, formType),
          eq(whtSequenceCounters.year, year)
        )
      )
      .limit(1);

    if (existing.length === 0) {
      // First allocation for this org/form/year — insert with seq=1, return 1
      try {
        await db.insert(whtSequenceCounters).values({
          orgId,
          formType,
          year,
          nextSequence: 2, // We're consuming 1, so next available is 2
        });
        return 1;
      } catch (error) {
        // UNIQUE violation means another call inserted first — retry
        if (isUniqueViolation(error)) continue;
        throw error;
      }
    }

    const { id, nextSequence } = existing[0];
    const allocated = nextSequence;

    // Optimistic update: increment only if nextSequence hasn't changed
    const updated = await db
      .update(whtSequenceCounters)
      .set({ nextSequence: allocated + 1 })
      .where(
        and(
          eq(whtSequenceCounters.id, id),
          eq(whtSequenceCounters.nextSequence, allocated)
        )
      )
      .returning({ nextSequence: whtSequenceCounters.nextSequence });

    if (updated.length > 0) {
      return allocated;
    }
    // Another caller incremented first — retry
  }

  throw new Error(
    `Failed to allocate WHT sequence number after ${MAX_SEQUENCE_RETRIES} attempts`
  );
}

function isUniqueViolation(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  // Postgres unique violation error code
  return error.message.includes("23505") || error.message.includes("unique");
}

// ---------------------------------------------------------------------------
// Certificate number formatting
// ---------------------------------------------------------------------------

function formatCertificateNo(
  formType: WhtFormType,
  year: number,
  seq: number
): string {
  return `${formType.toUpperCase()}/${year}/${String(seq).padStart(3, "0")}`;
}

// ---------------------------------------------------------------------------
// Create WHT certificate draft
// ---------------------------------------------------------------------------

export async function createWhtCertificateDraft(data: {
  orgId: string;
  vendorId: string;
  formType: WhtFormType;
  paymentDate: string;
  paymentId?: string;
  applyAnnualThreshold?: boolean;
  lineItems: Array<{
    documentId: string;
    lineItemId: string | null;
    baseAmount: string;
    whtRate: string;
    whtAmount: string;
    rdPaymentTypeCode?: string;
    whtType?: string;
  }>;
}): Promise<{
  certificateId: string;
  certificateNo: string;
  totalBaseAmount: string;
  totalWht: string;
}> {
  // Check if the payment date's period is locked
  const paymentDateObj = new Date(data.paymentDate);
  const paymentYear = paymentDateObj.getFullYear();
  const paymentMonth = paymentDateObj.getMonth() + 1;
  const locked =
    (await isPeriodLocked(data.orgId, "wht", paymentYear, paymentMonth)) ||
    (await isPeriodLocked(
      data.orgId,
      `wht_${data.formType}`,
      paymentYear,
      paymentMonth
    ));
  if (locked) {
    throw new Error(
      `Cannot create WHT certificate — period ${paymentMonth}/${paymentYear} is locked (already filed)`
    );
  }

  const year = new Date(data.paymentDate).getFullYear();
  const thresholdLineItems = data.applyAnnualThreshold
    ? await applyAnnualWhtThreshold({
        orgId: data.orgId,
        vendorId: data.vendorId,
        paymentId: data.paymentId,
        taxYear: year,
        lineItems: data.lineItems,
      })
    : data.lineItems;

  if (thresholdLineItems.length === 0) {
    return {
      certificateId: "",
      certificateNo: "",
      totalBaseAmount: "0.00",
      totalWht: "0.00",
    };
  }

  const seq = await allocateSequenceNumber(data.orgId, data.formType, year);
  const certificateNo = formatCertificateNo(data.formType, year, seq);

  // Calculate totals from line items using integer arithmetic to avoid float precision
  const totalBaseAmountCents = thresholdLineItems
    .reduce((sum, li) => sum + Math.round(parseFloat(li.baseAmount) * 100), 0);
  const totalBaseAmount = (totalBaseAmountCents / 100).toFixed(2);
  const totalWhtCents = thresholdLineItems
    .reduce((sum, li) => sum + Math.round(parseFloat(li.whtAmount) * 100), 0);
  const totalWht = (totalWhtCents / 100).toFixed(2);

  const [org] = await db
    .select({
      taxId: organizations.taxId,
      address: organizations.address,
      addressTh: organizations.addressTh,
    })
    .from(organizations)
    .where(eq(organizations.id, data.orgId))
    .limit(1);
  const [payee] = await db
    .select({
      taxId: vendors.taxId,
      address: vendors.address,
      addressTh: vendors.addressTh,
    })
    .from(vendors)
    .where(and(eq(vendors.id, data.vendorId), eq(vendors.orgId, data.orgId)))
    .limit(1);
  const paymentTypeDescription = Array.from(
    new Set(
      thresholdLineItems
        .map((li) => li.whtType ?? li.rdPaymentTypeCode)
        .filter((value): value is string => Boolean(value))
    )
  ).join(", ");

  const [cert] = await db
    .insert(whtCertificates)
    .values({
      orgId: data.orgId,
      certificateNo,
      payeeVendorId: data.vendorId,
      paymentDate: data.paymentDate,
      totalBaseAmount,
      totalWht,
      formType: data.formType,
      status: "draft",
      payerTaxIdSnapshot: org?.taxId ?? "",
      payerAddressSnapshot: org?.addressTh ?? org?.address ?? "",
      payeeAddressSnapshot: payee?.addressTh ?? payee?.address ?? "",
      payeeIdNumberSnapshot: payee?.taxId ?? "",
      paymentTypeDescription,
      signatoryNameSnapshot: "",
      signatoryPositionSnapshot: "",
    })
    .returning({ id: whtCertificates.id });

  // Create certificate items
  if (thresholdLineItems.length > 0) {
    await db.insert(whtCertificateItems).values(
      thresholdLineItems.map((li) => ({
        orgId: data.orgId,
        certificateId: cert.id,
        documentId: li.documentId,
        lineItemId: li.lineItemId,
        baseAmount: li.baseAmount,
        whtRate: li.whtRate,
        whtAmount: li.whtAmount,
        rdPaymentTypeCode: li.rdPaymentTypeCode,
        whtType: li.whtType,
      }))
    );
  }

  if (data.applyAnnualThreshold) {
    await db
      .update(whtAnnualThresholdDecisions)
      .set({ certificateId: cert.id })
      .where(
        and(
          eq(whtAnnualThresholdDecisions.orgId, data.orgId),
          eq(whtAnnualThresholdDecisions.payeeVendorId, data.vendorId),
          eq(whtAnnualThresholdDecisions.taxYear, year),
          sql`${whtAnnualThresholdDecisions.certificateId} IS NULL`,
          sql`${whtAnnualThresholdDecisions.thresholdStatus} IN ('withheld', 'catch_up_withheld')`
        )
      );
  }

  return { certificateId: cert.id, certificateNo, totalBaseAmount, totalWht };
}

async function applyAnnualWhtThreshold(data: {
  orgId: string;
  vendorId: string;
  paymentId?: string;
  taxYear: number;
  lineItems: Array<{
    documentId: string;
    lineItemId: string | null;
    baseAmount: string;
    whtRate: string;
    whtAmount: string;
    rdPaymentTypeCode?: string;
    whtType?: string;
  }>;
}) {
  const eligibleLineItems = data.lineItems.filter(
    (li) => parseFloat(li.baseAmount) > 0 && parseFloat(li.whtRate) > 0
  );
  if (eligibleLineItems.length === 0) return data.lineItems;

  const [ytd] = await db
    .select({
      total: sql<string>`COALESCE(SUM(${whtAnnualThresholdDecisions.eligibleBaseAmount}), 0)::numeric(14,2)::text`,
    })
    .from(whtAnnualThresholdDecisions)
    .where(
      and(
        eq(whtAnnualThresholdDecisions.orgId, data.orgId),
        eq(whtAnnualThresholdDecisions.payeeVendorId, data.vendorId),
        eq(whtAnnualThresholdDecisions.taxYear, data.taxYear)
      )
    );

  const ytdBase = parseFloat(ytd?.total ?? "0");
  const currentBase = eligibleLineItems.reduce(
    (sum, li) => sum + parseFloat(li.baseAmount),
    0
  );
  const cumulativeBase = ytdBase + currentBase;

  if (cumulativeBase <= WHT_ANNUAL_EXEMPTION_THRESHOLD) {
    const decisions = await db
      .insert(whtAnnualThresholdDecisions)
      .values(
        eligibleLineItems.map((li) => ({
          orgId: data.orgId,
          payeeVendorId: data.vendorId,
          documentId: li.documentId,
          lineItemId: li.lineItemId,
          paymentId: data.paymentId,
          taxYear: data.taxYear,
          eligibleBaseAmount: li.baseAmount,
          whtRate: li.whtRate,
          whtAmount: "0.00",
          thresholdStatus: "threshold_skipped",
        }))
      )
      .onConflictDoNothing()
      .returning({ id: whtAnnualThresholdDecisions.id });

    for (const decision of decisions) {
      await auditMutation({
        orgId: data.orgId,
        entityType: "wht_threshold_decision",
        entityId: decision.id,
        action: "create",
        newValue: {
          payeeVendorId: data.vendorId,
          taxYear: data.taxYear,
          ytdBase,
          currentBase,
          cumulativeBase,
          thresholdStatus: "threshold_skipped",
        },
      });
    }

    return [];
  }

  const skipped = await db
    .select({
      id: whtAnnualThresholdDecisions.id,
      documentId: whtAnnualThresholdDecisions.documentId,
      lineItemId: whtAnnualThresholdDecisions.lineItemId,
      baseAmount: whtAnnualThresholdDecisions.eligibleBaseAmount,
      whtRate: whtAnnualThresholdDecisions.whtRate,
    })
    .from(whtAnnualThresholdDecisions)
    .where(
      and(
        eq(whtAnnualThresholdDecisions.orgId, data.orgId),
        eq(whtAnnualThresholdDecisions.payeeVendorId, data.vendorId),
        eq(whtAnnualThresholdDecisions.taxYear, data.taxYear),
        eq(whtAnnualThresholdDecisions.thresholdStatus, "threshold_skipped"),
        sql`${whtAnnualThresholdDecisions.certificateId} IS NULL`
      )
    );

  const catchUpItems = skipped.map((decision) => {
    const base = parseFloat(decision.baseAmount);
    const rate = parseFloat(decision.whtRate);
    return {
      documentId: decision.documentId,
      lineItemId: decision.lineItemId,
      baseAmount: Number(base).toFixed(2),
      whtRate: Number(rate).toFixed(4),
      whtAmount: (base * rate).toFixed(2),
      rdPaymentTypeCode: "catch_up",
      whtType: "annual_threshold_catch_up",
    };
  });

  if (skipped.length > 0) {
    await db
      .update(whtAnnualThresholdDecisions)
      .set({
        thresholdStatus: "catch_up_withheld",
        whtAmount: sql`${whtAnnualThresholdDecisions.eligibleBaseAmount} * ${whtAnnualThresholdDecisions.whtRate}`,
      })
      .where(
        and(
          eq(whtAnnualThresholdDecisions.orgId, data.orgId),
          eq(whtAnnualThresholdDecisions.payeeVendorId, data.vendorId),
          eq(whtAnnualThresholdDecisions.taxYear, data.taxYear),
          eq(whtAnnualThresholdDecisions.thresholdStatus, "threshold_skipped"),
          sql`${whtAnnualThresholdDecisions.certificateId} IS NULL`
        )
      );
  }

  const currentWithheld = eligibleLineItems.map((li) => {
    const base = parseFloat(li.baseAmount);
    const rate = parseFloat(li.whtRate);
    return {
      ...li,
      whtAmount: (base * rate).toFixed(2),
    };
  });

  await db
    .insert(whtAnnualThresholdDecisions)
    .values(
      currentWithheld.map((li) => ({
        orgId: data.orgId,
        payeeVendorId: data.vendorId,
        documentId: li.documentId,
        lineItemId: li.lineItemId,
        paymentId: data.paymentId,
        taxYear: data.taxYear,
        eligibleBaseAmount: li.baseAmount,
        whtRate: li.whtRate,
        whtAmount: li.whtAmount,
        thresholdStatus: ytdBase <= WHT_ANNUAL_EXEMPTION_THRESHOLD
          ? "catch_up_withheld"
          : "withheld",
      }))
    )
    .onConflictDoNothing();

  return [...catchUpItems, ...currentWithheld];
}

// ---------------------------------------------------------------------------
// Query certificates by document
// ---------------------------------------------------------------------------

/**
 * Find WHT certificates linked to a specific document via certificate items.
 * Used for idempotency checks when confirming documents.
 */
export async function getCertificatesByDocument(
  orgId: string,
  documentId: string
) {
  const items = await db
    .select({ certificateId: whtCertificateItems.certificateId })
    .from(whtCertificateItems)
    .where(
      and(
        eq(whtCertificateItems.orgId, orgId),
        eq(whtCertificateItems.documentId, documentId)
      )
    )
    .limit(1);

  if (items.length === 0) return [];

  return db
    .select()
    .from(whtCertificates)
    .where(
      and(
        ...orgScope(whtCertificates, orgId),
        eq(whtCertificates.id, items[0].certificateId)
      )
    );
}

// ---------------------------------------------------------------------------
// Query certificates
// ---------------------------------------------------------------------------

export async function getCertificatesByOrg(
  orgId: string,
  filters?: { formType?: WhtFormType; status?: string }
) {
  const conditions = [...orgScope(whtCertificates, orgId)];

  if (filters?.formType) {
    conditions.push(eq(whtCertificates.formType, filters.formType));
  }
  if (filters?.status) {
    conditions.push(
      eq(
        whtCertificates.status,
        filters.status as "draft" | "issued" | "voided" | "replaced"
      )
    );
  }

  return db
    .select()
    .from(whtCertificates)
    .where(and(...conditions))
    .orderBy(sql`${whtCertificates.createdAt} DESC`);
}

/**
 * List certificates with vendor name joined in, for display in the list page.
 */
export async function getCertificatesWithVendors(
  orgId: string,
  filters?: { formType?: WhtFormType; status?: string }
) {
  const conditions = [...orgScope(whtCertificates, orgId)];

  if (filters?.formType) {
    conditions.push(eq(whtCertificates.formType, filters.formType));
  }
  if (filters?.status) {
    conditions.push(
      eq(
        whtCertificates.status,
        filters.status as "draft" | "issued" | "voided" | "replaced"
      )
    );
  }

  return db
    .select({
      id: whtCertificates.id,
      certificateNo: whtCertificates.certificateNo,
      formType: whtCertificates.formType,
      paymentDate: whtCertificates.paymentDate,
      issuedDate: whtCertificates.issuedDate,
      totalBaseAmount: whtCertificates.totalBaseAmount,
      totalWht: whtCertificates.totalWht,
      status: whtCertificates.status,
      pdfUrl: whtCertificates.pdfUrl,
      vendorName: vendors.name,
    })
    .from(whtCertificates)
    .leftJoin(
      vendors,
      and(
        eq(whtCertificates.payeeVendorId, vendors.id),
        eq(whtCertificates.orgId, vendors.orgId)
      )
    )
    .where(and(...conditions))
    .orderBy(sql`${whtCertificates.createdAt} DESC`);
}

export async function getCertificateWithItems(orgId: string, certId: string) {
  const certs = await db
    .select()
    .from(whtCertificates)
    .where(
      and(
        ...orgScope(whtCertificates, orgId),
        eq(whtCertificates.id, certId)
      )
    )
    .limit(1);

  if (certs.length === 0) return null;

  const items = await db
    .select()
    .from(whtCertificateItems)
    .where(
      and(
        ...orgScope(whtCertificateItems, orgId),
        eq(whtCertificateItems.certificateId, certId)
      )
    );

  return { ...certs[0], items };
}

// ---------------------------------------------------------------------------
// Void a WHT certificate
// ---------------------------------------------------------------------------

/**
 * Void a WHT certificate. The certificate number is retained (never reused).
 * Sets status='voided', records voided_at and void_reason.
 *
 * Cannot void an already-voided certificate.
 */
export async function voidCertificate(
  orgId: string,
  certId: string,
  reason: string
): Promise<void> {
  // Verify the certificate exists and is not already voided
  const existing = await db
    .select({
      id: whtCertificates.id,
      status: whtCertificates.status,
      certificateNo: whtCertificates.certificateNo,
    })
    .from(whtCertificates)
    .where(
      and(
        ...orgScope(whtCertificates, orgId),
        eq(whtCertificates.id, certId)
      )
    )
    .limit(1);

  if (existing.length === 0) {
    throw new Error("Certificate not found");
  }

  if (existing[0].status === "voided") {
    throw new Error("Certificate is already voided");
  }

  const now = new Date();

  await db
    .update(whtCertificates)
    .set({
      status: "voided",
      voidedAt: now,
      voidReason: reason,
    })
    .where(
      and(
        ...orgScope(whtCertificates, orgId),
        eq(whtCertificates.id, certId)
      )
    );

  await auditMutation({
    orgId,
    entityType: "wht_certificate",
    entityId: certId,
    action: "void",
    oldValue: { status: existing[0].status },
    newValue: {
      status: "voided",
      voidReason: reason,
      voidedAt: now.toISOString(),
    },
  });
}

// ---------------------------------------------------------------------------
// Create a replacement certificate
// ---------------------------------------------------------------------------

export interface CreateReplacementData {
  vendorId: string;
  formType: WhtFormType;
  paymentDate: string;
  lineItems: Array<{
    documentId: string;
    lineItemId: string;
    baseAmount: string;
    whtRate: string;
    whtAmount: string;
    rdPaymentTypeCode?: string;
    whtType?: string;
  }>;
}

/**
 * Create a replacement certificate for a voided one.
 * The new certificate gets the next available sequence number.
 * The replacement_cert_id FK links the voided cert to the new one.
 */
export async function createReplacementCertificate(
  orgId: string,
  voidedCertId: string,
  data: CreateReplacementData
): Promise<{ certificateId: string; certificateNo: string }> {
  // Verify the voided certificate exists and is actually voided
  const voided = await db
    .select({
      id: whtCertificates.id,
      status: whtCertificates.status,
    })
    .from(whtCertificates)
    .where(
      and(
        ...orgScope(whtCertificates, orgId),
        eq(whtCertificates.id, voidedCertId)
      )
    )
    .limit(1);

  if (voided.length === 0) {
    throw new Error("Voided certificate not found");
  }
  if (voided[0].status !== "voided") {
    throw new Error("Original certificate must be voided before creating a replacement");
  }

  // Create the new certificate (gets a new sequence number)
  const result = await createWhtCertificateDraft({
    orgId,
    ...data,
  });

  // Link the voided cert to the replacement via replacement_cert_id
  await db
    .update(whtCertificates)
    .set({ replacementCertId: result.certificateId })
    .where(
      and(
        ...orgScope(whtCertificates, orgId),
        eq(whtCertificates.id, voidedCertId)
      )
    );

  await auditMutation({
    orgId,
    entityType: "wht_certificate",
    entityId: result.certificateId,
    action: "create",
    newValue: {
      certificateNo: result.certificateNo,
      replacesVoidedCertId: voidedCertId,
    },
  });

  return result;
}
