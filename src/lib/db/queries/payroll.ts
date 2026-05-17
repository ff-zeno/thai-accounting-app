import { and, asc, desc, eq, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { ensureHeadOfficeEstablishment } from "./pos-sales-ledger";
import { db, type DbConnection } from "../index";
import {
  auditLog,
  employeeAllowances,
  employees,
  establishments,
  journalEntries,
  payRuns,
  paySlips,
  pitBrackets,
  pitStandardDeductions,
  pndFilings,
  periodLocks,
  ssoConfig,
  ssoFilings,
} from "../schema";
import { orgScope } from "../helpers/org-scope";
import { calculateMonthlyPit } from "@/lib/payroll/pit-calculator";
import { calculateSso } from "@/lib/payroll/sso-calculator";
import {
  createJournalEntryWithConnection,
  getGlAccounts,
  seedStandardGlAccounts,
  type JournalEntryLineInput,
  type PostingKind,
} from "./general-ledger";
import { enqueuePostingOutbox, lockGlPostingPeriod } from "./posting-outbox";
import { isAuditActorId } from "../helpers/audit-log";

type PayrollSensitiveReadOptions = {
  actorId?: string | null;
};

async function logPayrollSensitiveRead(data: {
  orgId: string;
  entityType: "employee" | "pay_run";
  entityId: string;
  readFieldSet: string[];
  actorId?: string | null;
  reason: string;
  metadata?: Record<string, unknown>;
}) {
  const readFieldSet = [...new Set(data.readFieldSet)].sort();
  const readFieldSetKey = readFieldSet.join(",");
  const actorPredicate = data.actorId
    ? eq(auditLog.actorId, data.actorId)
    : sql`${auditLog.actorId} IS NULL`;

  try {
    const [recent] = await db
      .select({ id: auditLog.id })
      .from(auditLog)
      .where(
        and(
          eq(auditLog.orgId, data.orgId),
          eq(auditLog.entityType, data.entityType),
          eq(auditLog.entityId, data.entityId),
          eq(auditLog.action, "read_pii"),
          actorPredicate,
          sql`${auditLog.createdAt} >= now() - interval '5 minutes'`,
          sql`${auditLog.newValue}->>'readFieldSetKey' = ${readFieldSetKey}`
        )
      )
      .limit(1);

    if (recent) return;

    await db.insert(auditLog).values({
      orgId: data.orgId,
      entityType: data.entityType,
      entityId: data.entityId,
      action: "read_pii",
      actorId: data.actorId ?? null,
      newValue: {
        event: "payroll_sensitive_read",
        readFieldSet,
        readFieldSetKey,
        reason: data.reason,
        // Metadata must describe context only; never include the sensitive values being read.
        ...(data.metadata ?? {}),
      },
    });
  } catch (error) {
    console.error("[payroll-sensitive-read-audit] Failed to write audit row:", error);
  }
}

export async function getPayrollDashboard(orgId: string) {
  await ensureHeadOfficeEstablishment(orgId);

  const [employeeSummary] = await db
    .select({
      employeeCount: sql<number>`COUNT(*)::int`,
      activeEmployeeCount: sql<number>`COUNT(*) FILTER (WHERE ${employees.endDate} IS NULL)::int`,
      directorCount: sql<number>`COUNT(*) FILTER (WHERE ${employees.isDirector} = true)::int`,
    })
    .from(employees)
    .where(and(...orgScope(employees, orgId)));

  const [payRunSummary] = await db
    .select({
      payRunCount: sql<number>`COUNT(*)::int`,
      draftPayRunCount: sql<number>`COUNT(*) FILTER (WHERE ${payRuns.status} = 'draft')::int`,
      approvedPayRunCount: sql<number>`COUNT(*) FILTER (WHERE ${payRuns.status} = 'approved')::int`,
    })
    .from(payRuns)
    .where(eq(payRuns.orgId, orgId));

  const [slipSummary] = await db
    .select({
      grossSalary: sql<string>`COALESCE(SUM(${paySlips.grossSalary}), 0)::numeric(14,2)`,
      pitWht: sql<string>`COALESCE(SUM(${paySlips.pitWht}), 0)::numeric(14,2)`,
      ssoEmployee: sql<string>`COALESCE(SUM(${paySlips.ssoEmployee}), 0)::numeric(14,2)`,
      ssoEmployer: sql<string>`COALESCE(SUM(${paySlips.ssoEmployer}), 0)::numeric(14,2)`,
      netPay: sql<string>`COALESCE(SUM(${paySlips.netPay}), 0)::numeric(14,2)`,
    })
    .from(paySlips)
    .where(eq(paySlips.orgId, orgId));

  const recentEmployees = await db
    .select({
      id: employees.id,
      fullNameTh: employees.fullNameTh,
      fullNameEn: employees.fullNameEn,
      position: employees.position,
      startDate: employees.startDate,
      endDate: employees.endDate,
      baseMonthlySalary: employees.baseMonthlySalary,
      salaryEffectiveFrom: employees.salaryEffectiveFrom,
      payFrequency: employees.payFrequency,
      isDirector: employees.isDirector,
      socialSecurityEligible: employees.socialSecurityEligible,
      branchNumber: establishments.branchNumber,
    })
    .from(employees)
    .innerJoin(establishments, eq(establishments.id, employees.establishmentId))
    .where(and(...orgScope(employees, orgId)))
    .orderBy(desc(employees.createdAt))
    .limit(30);

  const recentPayRuns = await db
    .select({
      id: payRuns.id,
      periodStart: payRuns.periodStart,
      periodEnd: payRuns.periodEnd,
      payDate: payRuns.payDate,
      status: payRuns.status,
      slipCount: sql<number>`COUNT(${paySlips.id})::int`,
      grossSalary: sql<string>`COALESCE(SUM(${paySlips.grossSalary}), 0)::numeric(14,2)`,
      pitWht: sql<string>`COALESCE(SUM(${paySlips.pitWht}), 0)::numeric(14,2)`,
      netPay: sql<string>`COALESCE(SUM(${paySlips.netPay}), 0)::numeric(14,2)`,
    })
    .from(payRuns)
    .leftJoin(paySlips, eq(paySlips.payRunId, payRuns.id))
    .where(eq(payRuns.orgId, orgId))
    .groupBy(
      payRuns.id,
      payRuns.periodStart,
      payRuns.periodEnd,
      payRuns.payDate,
      payRuns.status,
      payRuns.createdAt
    )
    .orderBy(desc(payRuns.payDate), desc(payRuns.createdAt))
    .limit(10);

  const recentPndFilings = await db
    .select()
    .from(pndFilings)
    .where(eq(pndFilings.orgId, orgId))
    .orderBy(desc(pndFilings.createdAt))
    .limit(10);

  const recentSsoFilings = await db
    .select()
    .from(ssoFilings)
    .where(eq(ssoFilings.orgId, orgId))
    .orderBy(desc(ssoFilings.createdAt))
    .limit(10);

  return {
    employeeSummary,
    payRunSummary,
    slipSummary,
    recentEmployees,
    recentPayRuns,
    recentPndFilings,
    recentSsoFilings,
  };
}

export async function getPayrollPndFilings(
  orgId: string,
  options?: { formType?: "PND1" | "PND1KOR" }
) {
  const filters = [eq(pndFilings.orgId, orgId)];
  if (options?.formType) {
    filters.push(eq(pndFilings.formType, options.formType));
  }

  return db
    .select()
    .from(pndFilings)
    .where(and(...filters))
    .orderBy(desc(pndFilings.taxPeriod), desc(pndFilings.createdAt))
    .limit(100);
}

export async function getPayrollSsoFilings(orgId: string) {
  return db
    .select()
    .from(ssoFilings)
    .where(eq(ssoFilings.orgId, orgId))
    .orderBy(desc(ssoFilings.taxMonth), desc(ssoFilings.createdAt))
    .limit(100);
}

export async function getActiveSsoConfig(asOfDate: string) {
  const [config] = await db
    .select()
    .from(ssoConfig)
    .where(
      and(
        lte(ssoConfig.effectiveFrom, asOfDate),
        or(isNull(ssoConfig.effectiveTo), sql`${ssoConfig.effectiveTo} >= ${asOfDate}`)
      )
    )
    .orderBy(desc(ssoConfig.effectiveFrom))
    .limit(1);

  return config ?? null;
}

// Filing submit/accept transitions record external RD/SSO acknowledgement
// metadata. They do not post GL or change source payroll amounts; period-lock
// enforcement stays on draft rebuild, remittance, and posting mutation paths.
export async function markPayrollPndFilingSubmitted(data: {
  orgId: string;
  filingId: string;
  rdReferenceNumber: string;
  actorId?: string | null;
}) {
  return db.transaction(async (tx) => {
    const [filing] = await tx
      .select()
      .from(pndFilings)
      .where(and(eq(pndFilings.orgId, data.orgId), eq(pndFilings.id, data.filingId)))
      .for("update")
      .limit(1);
    if (!filing) throw new Error("PND filing not found");
    if (filing.filingStatus !== "draft" && filing.filingStatus !== "rejected") {
      throw new Error("Only draft or rejected PND filings can be marked submitted");
    }

    const [updated] = await tx
      .update(pndFilings)
      .set({
        filingStatus: "submitted",
        submittedAt: new Date(),
        rdReferenceNumber: data.rdReferenceNumber,
        updatedAt: new Date(),
      })
      .where(and(eq(pndFilings.orgId, data.orgId), eq(pndFilings.id, data.filingId)))
      .returning();

    await tx.insert(auditLog).values({
      orgId: data.orgId,
      entityType: "pnd_filing",
      entityId: data.filingId,
      action: "update",
      actorId: data.actorId ?? null,
      oldValue: {
        filingStatus: filing.filingStatus,
        rdReferenceNumber: filing.rdReferenceNumber,
        submittedAt: filing.submittedAt,
        acceptedAt: filing.acceptedAt,
      },
      newValue: {
        event: "payroll_pnd_filing_submitted",
        filingStatus: updated.filingStatus,
        formType: updated.formType,
        taxPeriod: updated.taxPeriod,
        rdReferenceNumber: updated.rdReferenceNumber,
        submittedAt: updated.submittedAt,
        acceptedAt: updated.acceptedAt,
      },
    });

    return updated;
  });
}

export async function markPayrollPndFilingAccepted(data: {
  orgId: string;
  filingId: string;
  rdReferenceNumber?: string;
  actorId?: string | null;
}) {
  return db.transaction(async (tx) => {
    const [filing] = await tx
      .select()
      .from(pndFilings)
      .where(and(eq(pndFilings.orgId, data.orgId), eq(pndFilings.id, data.filingId)))
      .for("update")
      .limit(1);
    if (!filing) throw new Error("PND filing not found");
    if (filing.filingStatus !== "submitted") {
      throw new Error("Only submitted PND filings can be marked accepted");
    }

    const [updated] = await tx
      .update(pndFilings)
      .set({
        filingStatus: "accepted",
        acceptedAt: new Date(),
        rdReferenceNumber: data.rdReferenceNumber || filing.rdReferenceNumber,
        updatedAt: new Date(),
      })
      .where(and(eq(pndFilings.orgId, data.orgId), eq(pndFilings.id, data.filingId)))
      .returning();

    await tx.insert(auditLog).values({
      orgId: data.orgId,
      entityType: "pnd_filing",
      entityId: data.filingId,
      action: "update",
      actorId: data.actorId ?? null,
      oldValue: {
        filingStatus: filing.filingStatus,
        rdReferenceNumber: filing.rdReferenceNumber,
        submittedAt: filing.submittedAt,
        acceptedAt: filing.acceptedAt,
      },
      newValue: {
        event: "payroll_pnd_filing_accepted",
        filingStatus: updated.filingStatus,
        formType: updated.formType,
        taxPeriod: updated.taxPeriod,
        rdReferenceNumber: updated.rdReferenceNumber,
        submittedAt: updated.submittedAt,
        acceptedAt: updated.acceptedAt,
      },
    });

    return updated;
  });
}

export async function markPayrollSsoFilingSubmitted(data: {
  orgId: string;
  filingId: string;
  ssoReferenceNumber: string;
  actorId?: string | null;
}) {
  return db.transaction(async (tx) => {
    const [filing] = await tx
      .select()
      .from(ssoFilings)
      .where(and(eq(ssoFilings.orgId, data.orgId), eq(ssoFilings.id, data.filingId)))
      .for("update")
      .limit(1);
    if (!filing) throw new Error("SSO filing not found");
    if (filing.filingStatus !== "draft") {
      throw new Error("Only draft SSO filings can be marked submitted");
    }

    const [updated] = await tx
      .update(ssoFilings)
      .set({
        filingStatus: "submitted",
        submittedAt: new Date(),
        ssoReferenceNumber: data.ssoReferenceNumber,
        updatedAt: new Date(),
      })
      .where(and(eq(ssoFilings.orgId, data.orgId), eq(ssoFilings.id, data.filingId)))
      .returning();

    await tx.insert(auditLog).values({
      orgId: data.orgId,
      entityType: "sso_filing",
      entityId: data.filingId,
      action: "update",
      actorId: data.actorId ?? null,
      oldValue: {
        filingStatus: filing.filingStatus,
        ssoReferenceNumber: filing.ssoReferenceNumber,
        submittedAt: filing.submittedAt,
        acceptedAt: filing.acceptedAt,
      },
      newValue: {
        event: "payroll_sso_filing_submitted",
        filingStatus: updated.filingStatus,
        taxMonth: updated.taxMonth,
        ssoReferenceNumber: updated.ssoReferenceNumber,
        submittedAt: updated.submittedAt,
        acceptedAt: updated.acceptedAt,
      },
    });

    return updated;
  });
}

export async function markPayrollSsoFilingAccepted(data: {
  orgId: string;
  filingId: string;
  ssoReferenceNumber?: string;
  actorId?: string | null;
}) {
  return db.transaction(async (tx) => {
    const [filing] = await tx
      .select()
      .from(ssoFilings)
      .where(and(eq(ssoFilings.orgId, data.orgId), eq(ssoFilings.id, data.filingId)))
      .for("update")
      .limit(1);
    if (!filing) throw new Error("SSO filing not found");
    if (filing.filingStatus !== "submitted") {
      throw new Error("Only submitted SSO filings can be marked accepted");
    }

    const [updated] = await tx
      .update(ssoFilings)
      .set({
        filingStatus: "accepted",
        acceptedAt: new Date(),
        ssoReferenceNumber: data.ssoReferenceNumber || filing.ssoReferenceNumber,
        updatedAt: new Date(),
      })
      .where(and(eq(ssoFilings.orgId, data.orgId), eq(ssoFilings.id, data.filingId)))
      .returning();

    await tx.insert(auditLog).values({
      orgId: data.orgId,
      entityType: "sso_filing",
      entityId: data.filingId,
      action: "update",
      actorId: data.actorId ?? null,
      oldValue: {
        filingStatus: filing.filingStatus,
        ssoReferenceNumber: filing.ssoReferenceNumber,
        submittedAt: filing.submittedAt,
        acceptedAt: filing.acceptedAt,
      },
      newValue: {
        event: "payroll_sso_filing_accepted",
        filingStatus: updated.filingStatus,
        taxMonth: updated.taxMonth,
        ssoReferenceNumber: updated.ssoReferenceNumber,
        submittedAt: updated.submittedAt,
        acceptedAt: updated.acceptedAt,
      },
    });

    return updated;
  });
}

export async function getPayrollPayRunDetail(
  orgId: string,
  payRunId: string,
  options: PayrollSensitiveReadOptions = {}
) {
  const [payRun] = await db
    .select({
      id: payRuns.id,
      periodStart: payRuns.periodStart,
      periodEnd: payRuns.periodEnd,
      payDate: payRuns.payDate,
      status: payRuns.status,
      approvedBy: payRuns.approvedBy,
      approvedAt: payRuns.approvedAt,
      notes: payRuns.notes,
      branchNumber: establishments.branchNumber,
      establishmentName: establishments.nameEn,
    })
    .from(payRuns)
    .innerJoin(establishments, eq(establishments.id, payRuns.establishmentId))
    .where(and(eq(payRuns.orgId, orgId), eq(payRuns.id, payRunId)))
    .limit(1);

  if (!payRun) return null;

  const [summary] = await db
    .select({
      slipCount: sql<number>`COUNT(${paySlips.id})::int`,
      grossSalary: sql<string>`COALESCE(SUM(${paySlips.grossSalary}), 0)::numeric(14,2)`,
      bonus: sql<string>`COALESCE(SUM(${paySlips.bonus}), 0)::numeric(14,2)`,
      overtime: sql<string>`COALESCE(SUM(${paySlips.overtime}), 0)::numeric(14,2)`,
      otherTaxableIncome: sql<string>`COALESCE(SUM(${paySlips.otherTaxableIncome}), 0)::numeric(14,2)`,
      nonTaxableAllowances: sql<string>`COALESCE(SUM(${paySlips.nonTaxableAllowances}), 0)::numeric(14,2)`,
      pitWht: sql<string>`COALESCE(SUM(${paySlips.pitWht}), 0)::numeric(14,2)`,
      ssoEmployee: sql<string>`COALESCE(SUM(${paySlips.ssoEmployee}), 0)::numeric(14,2)`,
      ssoEmployer: sql<string>`COALESCE(SUM(${paySlips.ssoEmployer}), 0)::numeric(14,2)`,
      providentFundEmployee: sql<string>`COALESCE(SUM(${paySlips.providentFundEmployee}), 0)::numeric(14,2)`,
      providentFundEmployer: sql<string>`COALESCE(SUM(${paySlips.providentFundEmployer}), 0)::numeric(14,2)`,
      otherDeductions: sql<string>`COALESCE(SUM(${paySlips.otherDeductions}), 0)::numeric(14,2)`,
      netPay: sql<string>`COALESCE(SUM(${paySlips.netPay}), 0)::numeric(14,2)`,
    })
    .from(paySlips)
    .where(and(eq(paySlips.orgId, orgId), eq(paySlips.payRunId, payRunId)));

  const slips = await db
    .select({
      id: paySlips.id,
      employeeId: employees.id,
      employeeNameTh: employees.fullNameTh,
      employeeNameEn: employees.fullNameEn,
      position: employees.position,
      pnd1IncomeType: paySlips.pnd1IncomeType,
      grossSalary: paySlips.grossSalary,
      bonus: paySlips.bonus,
      overtime: paySlips.overtime,
      otherTaxableIncome: paySlips.otherTaxableIncome,
      nonTaxableAllowances: paySlips.nonTaxableAllowances,
      pitWht: paySlips.pitWht,
      ssoEmployee: paySlips.ssoEmployee,
      ssoEmployer: paySlips.ssoEmployer,
      providentFundEmployee: paySlips.providentFundEmployee,
      providentFundEmployer: paySlips.providentFundEmployer,
      otherDeductions: paySlips.otherDeductions,
      netPay: paySlips.netPay,
      paymentMethod: paySlips.paymentMethod,
      pndFilingId: paySlips.pndFilingId,
      whtCertificateId: paySlips.whtCertificateId,
    })
    .from(paySlips)
    .innerJoin(employees, eq(employees.id, paySlips.employeeId))
    .where(and(eq(paySlips.orgId, orgId), eq(paySlips.payRunId, payRunId)))
    .orderBy(
      asc(employees.fullNameEn),
      asc(employees.fullNameTh),
      asc(employees.createdAt),
      asc(employees.id),
      asc(paySlips.id)
    );

  await logPayrollSensitiveRead({
    orgId,
    entityType: "pay_run",
    entityId: payRunId,
    actorId: options.actorId,
    reason: "pay_run_detail_display",
    readFieldSet: [
      "pay_slip_gross_salary",
      "pay_slip_tax_withholding",
      "pay_slip_sso",
      "pay_slip_net_pay",
    ],
    metadata: {
      payDate: payRun.payDate,
      slipCount: slips.length,
      status: payRun.status,
    },
  });

  return {
    payRun,
    summary: summary ?? {
      slipCount: 0,
      grossSalary: "0.00",
      bonus: "0.00",
      overtime: "0.00",
      otherTaxableIncome: "0.00",
      nonTaxableAllowances: "0.00",
      pitWht: "0.00",
      ssoEmployee: "0.00",
      ssoEmployer: "0.00",
      providentFundEmployee: "0.00",
      providentFundEmployer: "0.00",
      otherDeductions: "0.00",
      netPay: "0.00",
    },
    slips,
  };
}

export async function createEmployee(data: {
  orgId: string;
  fullNameTh?: string;
  fullNameEn?: string;
  taxId?: string;
  passportNumber?: string;
  position?: string;
  startDate: string;
  baseMonthlySalary?: string;
  salaryEffectiveFrom?: string;
  payFrequency?: string;
  payPeriodsPerYear?: number;
  isDirector?: boolean;
  socialSecurityEligible?: boolean;
}) {
  const establishment = await ensureHeadOfficeEstablishment(data.orgId);
  const [employee] = await db
    .insert(employees)
    .values({
      orgId: data.orgId,
      establishmentId: establishment.id,
      fullNameTh: data.fullNameTh || null,
      fullNameEn: data.fullNameEn || null,
      taxId: data.taxId || null,
      passportNumber: data.passportNumber || null,
      position: data.position || null,
      startDate: data.startDate,
      baseMonthlySalary: data.baseMonthlySalary ?? "0.00",
      salaryEffectiveFrom: data.salaryEffectiveFrom || data.startDate,
      payFrequency: data.payFrequency || "monthly",
      payPeriodsPerYear: data.payPeriodsPerYear ?? 12,
      isDirector: data.isDirector ?? false,
      socialSecurityEligible: data.socialSecurityEligible ?? true,
    })
    .returning();

  const taxYear = Number(data.startDate.slice(0, 4));
  await db
    .insert(employeeAllowances)
    .values({
      orgId: data.orgId,
      employeeId: employee.id,
      taxYear,
      effectiveFromMonth: `${taxYear}-01-01`,
      recordedByEmployerAt: new Date(),
    })
    .onConflictDoNothing();

  return employee;
}

export async function getPayrollEmployees(orgId: string) {
  await ensureHeadOfficeEstablishment(orgId);

  return db
    .select({
      id: employees.id,
      fullNameTh: employees.fullNameTh,
      fullNameEn: employees.fullNameEn,
      position: employees.position,
      startDate: employees.startDate,
      endDate: employees.endDate,
      baseMonthlySalary: employees.baseMonthlySalary,
      salaryEffectiveFrom: employees.salaryEffectiveFrom,
      payFrequency: employees.payFrequency,
      payPeriodsPerYear: employees.payPeriodsPerYear,
      isDirector: employees.isDirector,
      socialSecurityEligible: employees.socialSecurityEligible,
      branchNumber: establishments.branchNumber,
      allowanceCount: sql<number>`COUNT(${employeeAllowances.id})::int`,
      latestAllowanceYear: sql<number | null>`MAX(${employeeAllowances.taxYear})::int`,
    })
    .from(employees)
    .innerJoin(establishments, eq(establishments.id, employees.establishmentId))
    .leftJoin(
      employeeAllowances,
      and(
        eq(employeeAllowances.orgId, employees.orgId),
        eq(employeeAllowances.employeeId, employees.id)
      )
    )
    .where(and(...orgScope(employees, orgId)))
    .groupBy(
      employees.id,
      employees.fullNameTh,
      employees.fullNameEn,
      employees.position,
      employees.startDate,
      employees.endDate,
      employees.baseMonthlySalary,
      employees.salaryEffectiveFrom,
      employees.payFrequency,
      employees.payPeriodsPerYear,
      employees.isDirector,
      employees.socialSecurityEligible,
      establishments.branchNumber
    )
    .orderBy(asc(employees.endDate), asc(employees.fullNameEn), asc(employees.fullNameTh));
}

export async function getPayrollEmployeeDetail(
  orgId: string,
  employeeId: string,
  options: PayrollSensitiveReadOptions = {}
) {
  const [employee] = await db
    .select({
      id: employees.id,
      fullNameTh: employees.fullNameTh,
      fullNameEn: employees.fullNameEn,
      position: employees.position,
      startDate: employees.startDate,
      endDate: employees.endDate,
      baseMonthlySalary: employees.baseMonthlySalary,
      salaryEffectiveFrom: employees.salaryEffectiveFrom,
      payFrequency: employees.payFrequency,
      payPeriodsPerYear: employees.payPeriodsPerYear,
      isDirector: employees.isDirector,
      socialSecurityEligible: employees.socialSecurityEligible,
      providentFundEligible: employees.providentFundEligible,
      priorEmployerYtdGross: employees.priorEmployerYtdGross,
      priorEmployerYtdPit: employees.priorEmployerYtdPit,
      priorEmployerYtdAsOfMonth: employees.priorEmployerYtdAsOfMonth,
      branchNumber: establishments.branchNumber,
      establishmentName: sql<string>`COALESCE(${establishments.nameTh}, ${establishments.nameEn}, '')`,
    })
    .from(employees)
    .innerJoin(establishments, eq(establishments.id, employees.establishmentId))
    .where(and(...orgScope(employees, orgId), eq(employees.id, employeeId)))
    .limit(1);

  if (!employee) return null;

  const allowances = await db
    .select()
    .from(employeeAllowances)
    .where(
      and(
        eq(employeeAllowances.orgId, orgId),
        eq(employeeAllowances.employeeId, employeeId)
      )
    )
    .orderBy(desc(employeeAllowances.taxYear), desc(employeeAllowances.effectiveFromMonth));

  const recentSlips = await db
    .select({
      id: paySlips.id,
      payRunId: paySlips.payRunId,
      periodStart: payRuns.periodStart,
      periodEnd: payRuns.periodEnd,
      payDate: payRuns.payDate,
      status: payRuns.status,
      grossSalary: paySlips.grossSalary,
      pitWht: paySlips.pitWht,
      ssoEmployee: paySlips.ssoEmployee,
      ssoEmployer: paySlips.ssoEmployer,
      netPay: paySlips.netPay,
      pnd1IncomeType: paySlips.pnd1IncomeType,
    })
    .from(paySlips)
    .innerJoin(payRuns, eq(payRuns.id, paySlips.payRunId))
    .where(and(eq(paySlips.orgId, orgId), eq(paySlips.employeeId, employeeId)))
    .orderBy(desc(payRuns.payDate), desc(paySlips.createdAt))
    .limit(20);

  await logPayrollSensitiveRead({
    orgId,
    entityType: "employee",
    entityId: employeeId,
    actorId: options.actorId,
    reason: "employee_payroll_detail_display",
    readFieldSet: [
      "base_monthly_salary",
      "allowance_declarations",
      "recent_pay_slips",
      "prior_employer_ytd",
    ],
    metadata: {
      allowanceCount: allowances.length,
      recentSlipCount: recentSlips.length,
    },
  });

  return { employee, allowances, recentSlips };
}

export async function createEmployeeAllowance(data: {
  orgId: string;
  employeeId: string;
  taxYear: number;
  effectiveFromMonth: string;
  personalAllowance?: string;
  spouseAllowance?: string;
  childCountPre2018?: number;
  childCountPost2018SecondPlus?: number;
  parentAllowance?: string;
  disabledDependentAllowance?: string;
  healthInsurancePremium?: string;
  lifeInsurancePremium?: string;
  parentsHealthInsurance?: string;
  pensionInsurance?: string;
  providentFundContributionPct?: string;
  ltfRmfSsfAmount?: string;
  mortgageInterest?: string;
  recordedByUserId?: string;
}) {
  return db.transaction(async (tx) => {
    const [employee] = await tx
      .select({ id: employees.id })
      .from(employees)
      .where(and(...orgScope(employees, data.orgId), eq(employees.id, data.employeeId)))
      .limit(1);
    if (!employee) throw new Error("Employee not found");

    const [allowance] = await tx
      .insert(employeeAllowances)
      .values({
        orgId: data.orgId,
        employeeId: data.employeeId,
        taxYear: data.taxYear,
        effectiveFromMonth: data.effectiveFromMonth,
        personalAllowance: data.personalAllowance ?? "60000.00",
        spouseAllowance: data.spouseAllowance ?? "0.00",
        childCountPre2018: data.childCountPre2018 ?? 0,
        childCountPost2018SecondPlus: data.childCountPost2018SecondPlus ?? 0,
        parentAllowance: data.parentAllowance ?? "0.00",
        disabledDependentAllowance: data.disabledDependentAllowance ?? "0.00",
        healthInsurancePremium: data.healthInsurancePremium ?? "0.00",
        lifeInsurancePremium: data.lifeInsurancePremium ?? "0.00",
        parentsHealthInsurance: data.parentsHealthInsurance ?? "0.00",
        pensionInsurance: data.pensionInsurance ?? "0.00",
        providentFundContributionPct: data.providentFundContributionPct ?? "0.0000",
        ltfRmfSsfAmount: data.ltfRmfSsfAmount ?? "0.00",
        mortgageInterest: data.mortgageInterest ?? "0.00",
        recordedByEmployerAt: new Date(),
        recordedByUserId: data.recordedByUserId ?? null,
      })
      .returning();

    await tx.insert(auditLog).values({
      orgId: data.orgId,
      entityType: "employee_allowance",
      entityId: allowance.id,
      action: "create",
      newValue: {
        event: "employee_allowance_recorded",
        employeeId: data.employeeId,
        taxYear: data.taxYear,
        effectiveFromMonth: data.effectiveFromMonth,
      },
    });

    return allowance;
  });
}

function money(value: number) {
  return value.toFixed(2);
}

function periodNumberFor(payDate: string) {
  return Number(payDate.slice(5, 7));
}

function toCents(value: string | number | null | undefined) {
  return Math.round(Number(value ?? 0) * 100);
}

async function assertPayrollPeriodUnlocked(
  tx: DbConnection,
  data: { orgId: string; taxMonth: string }
) {
  const periodYear = Number(data.taxMonth.slice(0, 4));
  const periodMonth = Number(data.taxMonth.slice(5, 7));
  const locks = await tx
    .select({ id: periodLocks.id })
    .from(periodLocks)
    .where(
      and(
        eq(periodLocks.orgId, data.orgId),
        eq(periodLocks.domain, "payroll"),
        eq(periodLocks.periodYear, periodYear),
        or(eq(periodLocks.periodMonth, periodMonth), isNull(periodLocks.periodMonth)),
        isNull(periodLocks.unlockedAt)
      )
    )
    .limit(1);
  if (locks.length > 0) throw new Error("Payroll period is locked");
}

async function assertGlPeriodUnlocked(
  tx: DbConnection,
  data: { orgId: string; payDate: string }
) {
  const periodYear = Number(data.payDate.slice(0, 4));
  const periodMonth = Number(data.payDate.slice(5, 7));
  const locks = await tx
    .select({ id: periodLocks.id })
    .from(periodLocks)
    .where(
      and(
        eq(periodLocks.orgId, data.orgId),
        eq(periodLocks.domain, "gl"),
        eq(periodLocks.periodYear, periodYear),
        or(eq(periodLocks.periodMonth, periodMonth), isNull(periodLocks.periodMonth)),
        isNull(periodLocks.unlockedAt)
      )
    )
    .limit(1);
  if (locks.length > 0) throw new Error("GL period is locked");
}

async function lockGlPostingPeriodForPayrollDate(
  tx: DbConnection,
  orgId: string,
  payDate: string
) {
  await lockGlPostingPeriod(tx, orgId, Number(payDate.slice(0, 4)), Number(payDate.slice(5, 7)));
}

async function lockJournalEntryPrefix(tx: DbConnection, orgId: string, prefix: string) {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`journal-entry:${orgId}:${prefix}`}))`);
}

async function postPayRunApprovalToGl(
  tx: DbConnection,
  data: {
    orgId: string;
    payRun: typeof payRuns.$inferSelect;
    createdByUserId?: string;
  }
) {
  const [existing] = await tx
    .select({ id: journalEntries.id })
    .from(journalEntries)
    .where(
      and(
        eq(journalEntries.orgId, data.orgId),
        eq(journalEntries.sourceEntityType, "pay_run"),
        eq(journalEntries.sourceEntityId, data.payRun.id),
        eq(journalEntries.postingKind, "payroll_accrual")
      )
    )
    .limit(1);
  if (existing) return existing.id;

  const slips = await tx
    .select()
    .from(paySlips)
    .where(
      and(
        eq(paySlips.orgId, data.orgId),
        eq(paySlips.payRunId, data.payRun.id)
      )
    );
  if (slips.length === 0) throw new Error("Pay run has no pay slips to post");

  const totals = slips.reduce(
    (sum, slip) => {
      sum.gross +=
        toCents(slip.grossSalary) +
        toCents(slip.bonus) +
        toCents(slip.overtime) +
        toCents(slip.otherTaxableIncome) +
        toCents(slip.nonTaxableAllowances) +
        toCents(slip.severancePayment) +
        toCents(slip.accruedLeavePayout) +
        toCents(slip.inlieuOfNotice);
      sum.pit += toCents(slip.pitWht);
      sum.ssoEmployee += toCents(slip.ssoEmployee);
      sum.ssoEmployer += toCents(slip.ssoEmployer);
      sum.netPay += toCents(slip.netPay);
      return sum;
    },
    { gross: 0, pit: 0, ssoEmployee: 0, ssoEmployer: 0, netPay: 0 }
  );

  await seedStandardGlAccounts(data.orgId, tx);
  const accounts = await getGlAccounts(data.orgId, tx);
  const accountByCode = new Map(accounts.map((account) => [account.accountCode, account]));
  const required = ["6110", "6112", "2156", "2157", "2158"];
  for (const code of required) {
    if (!accountByCode.get(code)) throw new Error(`Missing payroll GL account ${code}`);
  }

  const lines: JournalEntryLineInput[] = [
    {
      accountId: accountByCode.get("6110")!.id,
      description: `Payroll gross ${data.payRun.payDate}`,
      debitAmount: money((totals.netPay + totals.pit + totals.ssoEmployee) / 100),
      creditAmount: "0.00",
      allocationCategory: "payroll:gross_salary",
    },
  ];
  if (totals.ssoEmployer > 0) {
    lines.push({
      accountId: accountByCode.get("6112")!.id,
      description: `Employer SSO ${data.payRun.payDate}`,
      debitAmount: money(totals.ssoEmployer / 100),
      creditAmount: "0.00",
      allocationCategory: "payroll:employer_sso",
    });
  }
  if (totals.pit > 0) {
    lines.push({
      accountId: accountByCode.get("2156")!.id,
      description: `Payroll PIT withheld ${data.payRun.payDate}`,
      debitAmount: "0.00",
      creditAmount: money(totals.pit / 100),
    });
  }
  if (totals.ssoEmployee + totals.ssoEmployer > 0) {
    lines.push({
      accountId: accountByCode.get("2157")!.id,
      description: `Payroll SSO payable ${data.payRun.payDate}`,
      debitAmount: "0.00",
      creditAmount: money((totals.ssoEmployee + totals.ssoEmployer) / 100),
    });
  }
  lines.push({
    accountId: accountByCode.get("2158")!.id,
    description: `Net payroll payable ${data.payRun.payDate}`,
    debitAmount: "0.00",
    creditAmount: money(totals.netPay / 100),
  });

  const entryPrefix = `PAY-${data.payRun.payDate.slice(0, 7)}-`;

  const entry = await createJournalEntryWithConnection(
    {
      orgId: data.orgId,
      entryNumber: await nextJournalEntryNumber(tx, data.orgId, entryPrefix),
      entryDate: data.payRun.payDate,
      entryType: "auto_payroll",
      postingKind: "payroll_accrual",
      sourceEntityType: "pay_run",
      sourceEntityId: data.payRun.id,
      description: `Payroll accrual ${data.payRun.payDate}`,
      createdByUserId: data.createdByUserId,
      lines,
    },
    tx
  );

  await tx.insert(auditLog).values({
    orgId: data.orgId,
    entityType: "journal_entry",
    entityId: entry.id,
    action: "create",
    newValue: {
      event: "payroll_accrual_posted",
      payRunId: data.payRun.id,
      payDate: data.payRun.payDate,
      slipCount: slips.length,
    },
  });

  return entry.id;
}

async function nextJournalEntryNumber(
  tx: DbConnection,
  orgId: string,
  prefix: string
) {
  await lockJournalEntryPrefix(tx, orgId, prefix);
  const [{ count }] = await tx
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(journalEntries)
    .where(
      and(
        eq(journalEntries.orgId, orgId),
        sql`${journalEntries.entryNumber} LIKE ${`${prefix}%`}`
      )
    );

  return `${prefix}${String((count ?? 0) + 1).padStart(3, "0")}`;
}

async function postPayrollPaymentEntry(
  tx: DbConnection,
  data: {
    orgId: string;
    sourceEntityType: "pay_run" | "pnd_filing" | "sso_filing";
    sourceEntityId: string;
    postingKind: PostingKind;
    entryPrefix: string;
    entryDate: string;
    debitAccountCode: string;
    amount: string;
    description: string;
    createdByUserId?: string;
  }
) {
  if (Number(data.amount) <= 0) throw new Error("Payroll payment amount must be positive");

  const [existing] = await tx
    .select({ id: journalEntries.id })
    .from(journalEntries)
    .where(
      and(
        eq(journalEntries.orgId, data.orgId),
        eq(journalEntries.sourceEntityType, data.sourceEntityType),
        eq(journalEntries.sourceEntityId, data.sourceEntityId),
        eq(journalEntries.postingKind, data.postingKind)
      )
    )
    .limit(1);
  if (existing) return existing.id;

  await seedStandardGlAccounts(data.orgId, tx);
  const accounts = await getGlAccounts(data.orgId, tx);
  const accountByCode = new Map(accounts.map((account) => [account.accountCode, account]));
  const debitAccount = accountByCode.get(data.debitAccountCode);
  const bankAccount = accountByCode.get("1111");
  if (!debitAccount || !bankAccount) {
    throw new Error("Missing payroll payment GL accounts");
  }

  const entry = await createJournalEntryWithConnection(
    {
      orgId: data.orgId,
      entryNumber: await nextJournalEntryNumber(tx, data.orgId, data.entryPrefix),
      entryDate: data.entryDate,
      entryType: "auto_payroll",
      postingKind: data.postingKind,
      sourceEntityType: data.sourceEntityType,
      sourceEntityId: data.sourceEntityId,
      description: data.description,
      createdByUserId: data.createdByUserId,
      lines: [
        {
          accountId: debitAccount.id,
          description: data.description,
          debitAmount: data.amount,
          creditAmount: "0.00",
        },
        {
          accountId: bankAccount.id,
          description: data.description,
          debitAmount: "0.00",
          creditAmount: data.amount,
        },
      ],
    },
    tx
  );

  await tx.insert(auditLog).values({
    orgId: data.orgId,
    entityType: "journal_entry",
    entityId: entry.id,
    action: "create",
    newValue: {
      event: "payroll_payment_posted",
      sourceEntityType: data.sourceEntityType,
      sourceEntityId: data.sourceEntityId,
      postingKind: data.postingKind,
      amount: data.amount,
    },
  });

  return entry.id;
}

async function payrollJournalEntryById(
  tx: DbConnection,
  orgId: string,
  entryId: string
) {
  const [entry] = await tx
    .select()
    .from(journalEntries)
    .where(and(eq(journalEntries.orgId, orgId), eq(journalEntries.id, entryId)))
    .limit(1);
  if (!entry) throw new Error("Payroll journal entry not found after posting");
  return entry;
}

export async function postPayrollNetPaymentJournalEntry(
  tx: DbConnection,
  data: {
    orgId: string;
    payRunId: string;
    paymentDate: string;
    createdByUserId?: string;
    updateSourceState?: boolean;
  }
) {
  const [payRun] = await tx
    .select()
    .from(payRuns)
    .where(and(eq(payRuns.orgId, data.orgId), eq(payRuns.id, data.payRunId)))
    .limit(1);
  if (!payRun) throw new Error("Pay run not found");
  if (payRun.status !== "approved" && payRun.status !== "paid") {
    throw new Error("Only approved pay runs can be paid");
  }
  if (data.paymentDate < payRun.payDate) {
    throw new Error("Payment date cannot precede pay date");
  }

  const [total] = await tx
    .select({
      netPay: sql<string>`COALESCE(SUM(${paySlips.netPay}), 0)::numeric(14,2)`,
    })
    .from(paySlips)
    .where(and(eq(paySlips.orgId, data.orgId), eq(paySlips.payRunId, data.payRunId)));
  if (Number(total?.netPay ?? "0") <= 0) {
    throw new Error("Pay run has no net pay to record");
  }

  const entryId = await postPayrollPaymentEntry(tx, {
    orgId: data.orgId,
    sourceEntityType: "pay_run",
    sourceEntityId: data.payRunId,
    postingKind: "payroll_net_payment",
    entryPrefix: `PAYNET-${data.paymentDate.slice(0, 7)}-`,
    entryDate: data.paymentDate,
    debitAccountCode: "2158",
    amount: total.netPay,
    description: `Net payroll payment ${data.paymentDate}`,
    createdByUserId: data.createdByUserId,
  });
  if (data.updateSourceState !== false && payRun.status !== "paid") {
    const [updated] = await tx
      .update(payRuns)
      .set({ status: "paid", updatedAt: new Date() })
      .where(and(eq(payRuns.orgId, data.orgId), eq(payRuns.id, data.payRunId)))
      .returning();
    await tx.insert(auditLog).values({
      orgId: data.orgId,
      entityType: "pay_run",
      entityId: data.payRunId,
      action: "update",
      actorId: isAuditActorId(data.createdByUserId) ? data.createdByUserId : null,
      oldValue: {
        status: payRun.status,
      },
      newValue: {
        event: "pay_run_payment_recorded",
        status: updated.status,
        paymentDate: data.paymentDate,
        journalEntryId: entryId,
      },
    });
  }
  return payrollJournalEntryById(tx, data.orgId, entryId);
}

export async function postPnd1RemittanceJournalEntry(
  tx: DbConnection,
  data: {
    orgId: string;
    filingId: string;
    paymentDate: string;
    createdByUserId?: string;
    updateSourceState?: boolean;
  }
) {
  const [filing] = await tx
    .select()
    .from(pndFilings)
    .where(and(eq(pndFilings.orgId, data.orgId), eq(pndFilings.id, data.filingId)))
    .limit(1);
  if (!filing) throw new Error("PND.1 filing not found");
  if (filing.formType !== "PND1") throw new Error("Only PND.1 payroll remittance is supported here");
  if (filing.filingStatus !== "accepted") {
    throw new Error("Only accepted PND.1 filings can be paid");
  }

  const entryId = await postPayrollPaymentEntry(tx, {
    orgId: data.orgId,
    sourceEntityType: "pnd_filing",
    sourceEntityId: data.filingId,
    postingKind: "payroll_pnd1_remittance",
    entryPrefix: `PND1PAY-${data.paymentDate.slice(0, 7)}-`,
    entryDate: data.paymentDate,
    debitAccountCode: "2156",
    amount: filing.totalWhtAmount ?? "0.00",
    description: `PND.1 PIT remittance ${filing.taxPeriod}`,
    createdByUserId: data.createdByUserId,
  });
  if (data.updateSourceState !== false && !filing.paidAt) {
    const paidAt = new Date(`${data.paymentDate}T12:00:00+07:00`);
    const [updated] = await tx
      .update(pndFilings)
      .set({ paidAt, updatedAt: new Date() })
      .where(and(eq(pndFilings.orgId, data.orgId), eq(pndFilings.id, data.filingId)))
      .returning();
    await tx.insert(auditLog).values({
      orgId: data.orgId,
      entityType: "pnd_filing",
      entityId: data.filingId,
      action: "update",
      actorId: isAuditActorId(data.createdByUserId) ? data.createdByUserId : null,
      oldValue: {
        paidAt: filing.paidAt,
        filingStatus: filing.filingStatus,
      },
      newValue: {
        event: "payroll_pnd1_remittance_recorded",
        paidAt: updated.paidAt,
        paymentDate: data.paymentDate,
        amount: updated.totalWhtAmount,
        journalEntryId: entryId,
      },
    });
  }
  return payrollJournalEntryById(tx, data.orgId, entryId);
}

export async function postSsoRemittanceJournalEntry(
  tx: DbConnection,
  data: {
    orgId: string;
    filingId: string;
    paymentDate: string;
    createdByUserId?: string;
    updateSourceState?: boolean;
  }
) {
  const [filing] = await tx
    .select()
    .from(ssoFilings)
    .where(and(eq(ssoFilings.orgId, data.orgId), eq(ssoFilings.id, data.filingId)))
    .limit(1);
  if (!filing) throw new Error("SSO filing not found");
  if (filing.filingStatus !== "accepted") {
    throw new Error("Only accepted SSO filings can be paid");
  }

  const amount = money(
    Number(filing.totalEmployeeContribution ?? "0") +
      Number(filing.totalEmployerContribution ?? "0")
  );
  const entryId = await postPayrollPaymentEntry(tx, {
    orgId: data.orgId,
    sourceEntityType: "sso_filing",
    sourceEntityId: data.filingId,
    postingKind: "payroll_sso_remittance",
    entryPrefix: `SSOPAY-${data.paymentDate.slice(0, 7)}-`,
    entryDate: data.paymentDate,
    debitAccountCode: "2157",
    amount,
    description: `SSO remittance ${filing.taxMonth}`,
    createdByUserId: data.createdByUserId,
  });
  if (data.updateSourceState !== false && !filing.paidAt) {
    const paidAt = new Date(`${data.paymentDate}T12:00:00+07:00`);
    const [updated] = await tx
      .update(ssoFilings)
      .set({
        paidAt,
        payload: {
          ...(filing.payload && typeof filing.payload === "object" && !Array.isArray(filing.payload)
            ? filing.payload
            : {}),
          remittance: {
            paymentDate: data.paymentDate,
            postedAt: new Date().toISOString(),
            amount,
          },
        },
        updatedAt: new Date(),
      })
      .where(and(eq(ssoFilings.orgId, data.orgId), eq(ssoFilings.id, data.filingId)))
      .returning();
    await tx.insert(auditLog).values({
      orgId: data.orgId,
      entityType: "sso_filing",
      entityId: data.filingId,
      action: "update",
      actorId: isAuditActorId(data.createdByUserId) ? data.createdByUserId : null,
      oldValue: {
        paidAt: filing.paidAt,
        filingStatus: filing.filingStatus,
        ssoReferenceNumber: filing.ssoReferenceNumber,
      },
      newValue: {
        event: "payroll_sso_remittance_recorded",
        paidAt: updated.paidAt,
        paymentDate: data.paymentDate,
        amount,
        journalEntryId: entryId,
      },
    });
  }
  return payrollJournalEntryById(tx, data.orgId, entryId);
}

function hasSsoRemittancePayload(payload: unknown) {
  return (
    typeof payload === "object" &&
    payload !== null &&
    !Array.isArray(payload) &&
    "remittance" in payload
  );
}

export async function createDraftPayRun(data: {
  orgId: string;
  periodStart: string;
  periodEnd: string;
  payDate: string;
  defaultGrossSalary: string;
  notes?: string;
}) {
  const establishment = await ensureHeadOfficeEstablishment(data.orgId);
  const payYear = Number(data.payDate.slice(0, 4));
  const periodNumber = periodNumberFor(data.payDate);

  return db.transaction(async (tx) => {
    await assertPayrollPeriodUnlocked(tx as DbConnection, {
      orgId: data.orgId,
      taxMonth: data.payDate.slice(0, 7),
    });

    const activeEmployees = await tx
      .select()
      .from(employees)
      .where(
        and(
          eq(employees.orgId, data.orgId),
          eq(employees.establishmentId, establishment.id),
          isNull(employees.deletedAt),
          lte(employees.startDate, data.periodEnd),
          or(isNull(employees.endDate), sql`${employees.endDate} >= ${data.periodStart}`)
        )
      )
      .orderBy(employees.createdAt);

    if (activeEmployees.length === 0) {
      throw new Error("No active employees found for this payroll period");
    }
    if (activeEmployees.some((employee) => employee.payFrequency !== "monthly")) {
      throw new Error("Draft pay-run generation currently supports monthly employees only");
    }

    const brackets = await tx
      .select()
      .from(pitBrackets)
      .where(
        and(
          lte(pitBrackets.effectiveFrom, data.payDate),
          or(isNull(pitBrackets.effectiveTo), sql`${pitBrackets.effectiveTo} >= ${data.payDate}`)
        )
      )
      .orderBy(pitBrackets.lowerBound);

    if (brackets.length === 0) {
      throw new Error("No PIT bracket configuration is active for this pay date");
    }

    const [standardDeduction] = await tx
      .select()
      .from(pitStandardDeductions)
      .where(
        and(
          lte(pitStandardDeductions.effectiveFrom, data.payDate),
          or(
            isNull(pitStandardDeductions.effectiveTo),
            sql`${pitStandardDeductions.effectiveTo} >= ${data.payDate}`
          )
        )
      )
      .orderBy(desc(pitStandardDeductions.effectiveFrom))
      .limit(1);

    if (!standardDeduction) {
      throw new Error("No PIT deduction configuration is active for this pay date");
    }

    const [sso] = await tx
      .select()
      .from(ssoConfig)
      .where(
        and(
          lte(ssoConfig.effectiveFrom, data.payDate),
          or(isNull(ssoConfig.effectiveTo), sql`${ssoConfig.effectiveTo} >= ${data.payDate}`)
        )
      )
      .orderBy(desc(ssoConfig.effectiveFrom))
      .limit(1);

    if (!sso && activeEmployees.some((employee) => employee.socialSecurityEligible)) {
      throw new Error("No SSO configuration is active for this pay date");
    }

    const [payRun] = await tx
      .insert(payRuns)
      .values({
        orgId: data.orgId,
        establishmentId: establishment.id,
        periodStart: data.periodStart,
        periodEnd: data.periodEnd,
        payDate: data.payDate,
        notes: data.notes || null,
      })
      .returning();

    const slips = [];
    for (const employee of activeEmployees) {
      const employeeGrossSalary =
        Number(data.defaultGrossSalary) > 0
          ? data.defaultGrossSalary
          : employee.baseMonthlySalary;
      if (Number(employeeGrossSalary) <= 0) {
        throw new Error(`Missing base monthly salary for ${employee.fullNameEn ?? employee.fullNameTh ?? employee.id}`);
      }

      const [allowance] = await tx
        .select()
        .from(employeeAllowances)
        .where(
          and(
            eq(employeeAllowances.orgId, data.orgId),
            eq(employeeAllowances.employeeId, employee.id),
            eq(employeeAllowances.taxYear, payYear),
            lte(employeeAllowances.effectiveFromMonth, `${data.payDate.slice(0, 7)}-01`)
          )
        )
        .orderBy(desc(employeeAllowances.effectiveFromMonth))
        .limit(1);

      const [ytd] = await tx
        .select({
          gross: sql<string>`COALESCE(SUM(${paySlips.grossSalary} + ${paySlips.bonus} + ${paySlips.overtime} + ${paySlips.otherTaxableIncome}), 0)::numeric(14,2)`,
          pit: sql<string>`COALESCE(SUM(${paySlips.pitWht}), 0)::numeric(14,2)`,
        })
        .from(paySlips)
        .innerJoin(payRuns, eq(payRuns.id, paySlips.payRunId))
        .where(
          and(
            eq(paySlips.orgId, data.orgId),
            eq(paySlips.employeeId, employee.id),
            sql`EXTRACT(YEAR FROM ${payRuns.payDate}) = ${payYear}`,
            sql`${payRuns.payDate} < ${data.payDate}`,
            sql`${payRuns.status} <> 'voided'`
          )
        );

      const ssoResult =
        employee.socialSecurityEligible && sso
          ? calculateSso({ grossMonthly: employeeGrossSalary, config: sso })
          : {
              employee: "0.00",
              employer: "0.00",
              insurableWage: "0.00",
              contributionExempt: true,
              exemptionReason: "not_social_security_eligible",
            };

      const pitResult = calculateMonthlyPit({
        brackets,
        standardDeduction,
        allowances: {
          ...(allowance ?? {}),
          socialSecurityContribution:
            employee.socialSecurityEligible && sso
              ? money(Number(ssoResult.employee) * employee.payPeriodsPerYear)
              : allowance?.socialSecurityContribution,
        },
        ytdGrossPaid: Number(ytd?.gross ?? 0) + Number(employee.priorEmployerYtdGross ?? 0),
        ytdPitWithheld: Number(ytd?.pit ?? 0) + Number(employee.priorEmployerYtdPit ?? 0),
        currentPeriodGross: employeeGrossSalary,
        currentPeriodNumber: periodNumber,
        payPeriodsPerYear: employee.payPeriodsPerYear,
      });

      const grossSalary = Number(employeeGrossSalary);
      const pitWht = pitResult.monthlyWht;
      const ssoEmployee = Number(ssoResult.employee);
      const netPay = Math.max(0, grossSalary - pitWht - ssoEmployee);

      const [slip] = await tx
        .insert(paySlips)
        .values({
          orgId: data.orgId,
          establishmentId: establishment.id,
          payRunId: payRun.id,
          employeeId: employee.id,
          pnd1IncomeType: employee.isDirector ? "40_2" : "40_1",
          grossSalary: money(grossSalary),
          pitWht: money(pitWht),
          ssoEmployee: ssoResult.employee,
          ssoEmployer: ssoResult.employer,
          netPay: money(netPay),
          payload: {
            pit: pitResult,
            sso: ssoResult,
            source: "phase_11_draft_pay_run_calculator",
          },
        })
        .returning();

      slips.push(slip);
    }

    return { payRun, slips };
  });
}

export async function approvePayRun(data: {
  orgId: string;
  payRunId: string;
  approvedBy?: string;
}) {
  return db.transaction(async (tx) => {
    const [payRun] = await tx
      .select()
      .from(payRuns)
      .where(and(eq(payRuns.orgId, data.orgId), eq(payRuns.id, data.payRunId)))
      .for("update")
      .limit(1);
    if (!payRun) throw new Error("Pay run not found");
    if (payRun.status !== "draft") throw new Error("Only draft pay runs can be approved");

    await assertPayrollPeriodUnlocked(tx as DbConnection, {
      orgId: data.orgId,
      taxMonth: payRun.payDate.slice(0, 7),
    });
    await lockGlPostingPeriodForPayrollDate(tx as DbConnection, data.orgId, payRun.payDate);
    await assertGlPeriodUnlocked(tx as DbConnection, {
      orgId: data.orgId,
      payDate: payRun.payDate,
    });

    const [updated] = await tx
      .update(payRuns)
      .set({
        status: "approved",
        approvedBy: data.approvedBy || null,
        approvedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(payRuns.orgId, data.orgId), eq(payRuns.id, data.payRunId)))
      .returning();

    await tx.insert(auditLog).values({
      orgId: data.orgId,
      entityType: "pay_run",
      entityId: data.payRunId,
      action: "update",
      actorId: isAuditActorId(data.approvedBy) ? data.approvedBy : null,
      oldValue: {
        status: payRun.status,
        approvedAt: payRun.approvedAt,
      },
      newValue: {
        event: "pay_run_approved",
        status: updated.status,
        approvedAt: updated.approvedAt,
      },
    });

    await postPayRunApprovalToGl(tx as DbConnection, {
      orgId: data.orgId,
      payRun: updated,
      createdByUserId: data.approvedBy,
    });

    return updated;
  });
}

export async function recordPayRunPayment(data: {
  orgId: string;
  payRunId: string;
  paymentDate: string;
  paidBy?: string;
}) {
  return db.transaction(async (tx) => {
    const [payRun] = await tx
      .select()
      .from(payRuns)
      .where(and(eq(payRuns.orgId, data.orgId), eq(payRuns.id, data.payRunId)))
      .for("update")
      .limit(1);
    if (!payRun) throw new Error("Pay run not found");
    if (payRun.status === "paid") throw new Error("Pay run is already paid");
    if (payRun.status !== "approved") throw new Error("Only approved pay runs can be paid");
    if (data.paymentDate < payRun.payDate) {
      throw new Error("Payment date cannot precede pay date");
    }

    await assertPayrollPeriodUnlocked(tx as DbConnection, {
      orgId: data.orgId,
      taxMonth: payRun.payDate.slice(0, 7),
    });
    await lockGlPostingPeriodForPayrollDate(tx as DbConnection, data.orgId, data.paymentDate);
    await assertGlPeriodUnlocked(tx as DbConnection, {
      orgId: data.orgId,
      payDate: data.paymentDate,
    });

    await postPayrollNetPaymentJournalEntry(tx as DbConnection, {
      orgId: data.orgId,
      payRunId: data.payRunId,
      paymentDate: data.paymentDate,
      createdByUserId: data.paidBy,
      updateSourceState: false,
    });

    const [updated] = await tx
      .update(payRuns)
      .set({ status: "paid", updatedAt: new Date() })
      .where(and(eq(payRuns.orgId, data.orgId), eq(payRuns.id, data.payRunId)))
      .returning();

    await tx.insert(auditLog).values({
      orgId: data.orgId,
      entityType: "pay_run",
      entityId: data.payRunId,
      action: "update",
      actorId: isAuditActorId(data.paidBy) ? data.paidBy : null,
      oldValue: {
        status: payRun.status,
      },
      newValue: {
        event: "pay_run_payment_recorded",
        status: updated.status,
        paymentDate: data.paymentDate,
      },
    });

    await enqueuePostingOutbox({
      orgId: data.orgId,
      sourceEntityType: "pay_run",
      sourceEntityId: data.payRunId,
      eventType: "payment",
      postingDate: data.paymentDate,
      payload: { paymentDate: data.paymentDate, createdByUserId: data.paidBy ?? null },
      tx: tx as DbConnection,
    });

    return updated;
  });
}

function validateTaxMonth(taxMonth: string) {
  if (!/^\d{4}-\d{2}$/.test(taxMonth)) {
    throw new Error("Tax month must be in YYYY-MM format");
  }
}

function validateTaxYear(taxYear: number) {
  if (!Number.isInteger(taxYear) || taxYear < 2000 || taxYear > 2200) {
    throw new Error("Tax year is invalid");
  }
}

export async function buildPnd1Draft(data: {
  orgId: string;
  taxMonth: string;
}) {
  validateTaxMonth(data.taxMonth);
  const establishment = await ensureHeadOfficeEstablishment(data.orgId);

  return db.transaction(async (tx) => {
    await assertPayrollPeriodUnlocked(tx as DbConnection, data);
    await tx.execute(sql`LOCK TABLE pnd_filings IN SHARE ROW EXCLUSIVE MODE`);

    const [existing] = await tx
      .select({ id: pndFilings.id })
      .from(pndFilings)
      .where(
        and(
          eq(pndFilings.orgId, data.orgId),
          eq(pndFilings.establishmentId, establishment.id),
          eq(pndFilings.formType, "PND1"),
          eq(pndFilings.taxPeriod, data.taxMonth),
          eq(pndFilings.isAmendment, false)
        )
      )
      .limit(1);
    if (existing) throw new Error("PND.1 draft already exists for this month");

    const slipRows = await tx
      .select({
        slipId: paySlips.id,
        employeeId: employees.id,
        taxId: employees.taxId,
        passportNumber: employees.passportNumber,
        fullNameTh: employees.fullNameTh,
        fullNameEn: employees.fullNameEn,
        pnd1IncomeType: paySlips.pnd1IncomeType,
        grossAmount: sql<string>`(${paySlips.grossSalary} + ${paySlips.bonus} + ${paySlips.overtime} + ${paySlips.otherTaxableIncome})::numeric(14,2)::text`,
        pitWht: paySlips.pitWht,
      })
      .from(paySlips)
      .innerJoin(payRuns, eq(payRuns.id, paySlips.payRunId))
      .innerJoin(employees, eq(employees.id, paySlips.employeeId))
      .where(
        and(
          eq(paySlips.orgId, data.orgId),
          eq(paySlips.establishmentId, establishment.id),
          isNull(employees.deletedAt),
          sql`to_char(${payRuns.payDate}, 'YYYY-MM') = ${data.taxMonth}`,
          sql`${payRuns.status} IN ('approved', 'paid')`,
          isNull(paySlips.pndFilingId)
        )
      )
      .orderBy(employees.fullNameTh, employees.fullNameEn);

    if (slipRows.length === 0) {
      throw new Error("No unfiled pay slips found for this PND.1 month");
    }

    const lineMap = new Map<
      string,
      {
        employeeId: string;
        taxId: string | null;
        passportNumber: string | null;
        fullNameTh: string | null;
        fullNameEn: string | null;
        pnd1IncomeType: string;
        grossAmount: number;
        pitWht: number;
        slipIds: string[];
      }
    >();
    for (const row of slipRows) {
      const key = `${row.employeeId}:${row.pnd1IncomeType}`;
      const current =
        lineMap.get(key) ??
        {
          employeeId: row.employeeId,
          taxId: row.taxId,
          passportNumber: row.passportNumber,
          fullNameTh: row.fullNameTh,
          fullNameEn: row.fullNameEn,
          pnd1IncomeType: row.pnd1IncomeType,
          grossAmount: 0,
          pitWht: 0,
          slipIds: [],
        };
      current.grossAmount += Number(row.grossAmount);
      current.pitWht += Number(row.pitWht);
      current.slipIds.push(row.slipId);
      lineMap.set(key, current);
    }
    const lines = [...lineMap.values()];
    const totalGross = lines.reduce((sum, row) => sum + row.grossAmount, 0);
    const totalWht = lines.reduce((sum, row) => sum + row.pitWht, 0);
    const [filing] = await tx
      .insert(pndFilings)
      .values({
        orgId: data.orgId,
        establishmentId: establishment.id,
        formType: "PND1",
        taxPeriod: data.taxMonth,
        totalPayees: lines.length,
        totalGrossAmount: money(totalGross),
        totalWhtAmount: money(totalWht),
        payload: {
          source: "phase_11_pnd1_draft_builder",
          sourceUrls: [
            "https://www.rd.go.th/fileadmin/download/english_form/frm_pnd1.pdf",
            "https://www.rd.go.th/fileadmin/download/english_form/frm_pnd1_attach.pdf",
            "https://www.rd.go.th/english/6045.html",
          ],
          retrievalDate: "2026-05-16",
          lines: lines.map((row) => ({
            slipIds: row.slipIds,
            employeeId: row.employeeId,
            taxpayerId: row.taxId ?? row.passportNumber,
            fullName: row.fullNameTh ?? row.fullNameEn,
            incomeType: row.pnd1IncomeType,
            grossAmount: money(row.grossAmount),
            pitWht: money(row.pitWht),
          })),
        },
      })
      .returning();

    await tx
      .update(paySlips)
      .set({ pndFilingId: filing.id, updatedAt: new Date() })
      .where(
        and(
          eq(paySlips.orgId, data.orgId),
          eq(paySlips.establishmentId, establishment.id),
          inArray(paySlips.id, slipRows.map((row) => row.slipId))
        )
      );

    return { filing, lineCount: slipRows.length };
  });
}

export async function buildPnd1KorDraft(data: {
  orgId: string;
  taxYear: number;
}) {
  validateTaxYear(data.taxYear);
  const establishment = await ensureHeadOfficeEstablishment(data.orgId);
  const taxPeriod = String(data.taxYear);

  return db.transaction(async (tx) => {
    await assertPayrollPeriodUnlocked(tx as DbConnection, {
      orgId: data.orgId,
      taxMonth: `${taxPeriod}-12`,
    });
    await tx.execute(sql`LOCK TABLE pnd_filings IN SHARE ROW EXCLUSIVE MODE`);

    const [existing] = await tx
      .select({ id: pndFilings.id })
      .from(pndFilings)
      .where(
        and(
          eq(pndFilings.orgId, data.orgId),
          eq(pndFilings.establishmentId, establishment.id),
          eq(pndFilings.formType, "PND1KOR"),
          eq(pndFilings.taxPeriod, taxPeriod),
          eq(pndFilings.isAmendment, false)
        )
      )
      .limit(1);
    if (existing) throw new Error("PND.1 Kor draft already exists for this year");

    const slipRows = await tx
      .select({
        slipId: paySlips.id,
        employeeId: employees.id,
        taxId: employees.taxId,
        passportNumber: employees.passportNumber,
        fullNameTh: employees.fullNameTh,
        fullNameEn: employees.fullNameEn,
        pnd1IncomeType: paySlips.pnd1IncomeType,
        payDate: payRuns.payDate,
        grossAmount: sql<string>`(${paySlips.grossSalary} + ${paySlips.bonus} + ${paySlips.overtime} + ${paySlips.otherTaxableIncome})::numeric(14,2)::text`,
        pitWht: paySlips.pitWht,
      })
      .from(paySlips)
      .innerJoin(payRuns, eq(payRuns.id, paySlips.payRunId))
      .innerJoin(employees, eq(employees.id, paySlips.employeeId))
      .where(
        and(
          eq(paySlips.orgId, data.orgId),
          eq(paySlips.establishmentId, establishment.id),
          sql`EXTRACT(YEAR FROM ${payRuns.payDate}) = ${data.taxYear}`,
          sql`${payRuns.status} IN ('approved', 'paid')`
        )
      )
      .orderBy(employees.fullNameTh, employees.fullNameEn, payRuns.payDate);

    if (slipRows.length === 0) {
      throw new Error("No approved or paid pay slips found for this PND.1 Kor year");
    }

    const [monthlyTotals] = await tx
      .select({
        totalWht: sql<string>`COALESCE(SUM(${pndFilings.totalWhtAmount}), 0)::numeric(14,2)::text`,
        filingCount: sql<number>`COUNT(*)::int`,
      })
      .from(pndFilings)
      .where(
        and(
          eq(pndFilings.orgId, data.orgId),
          eq(pndFilings.establishmentId, establishment.id),
          eq(pndFilings.formType, "PND1"),
          eq(pndFilings.isAmendment, false),
          sql`${pndFilings.taxPeriod} LIKE ${`${taxPeriod}-%`}`
        )
      );
    if ((monthlyTotals?.filingCount ?? 0) === 0) {
      throw new Error("Build monthly PND.1 drafts before PND.1 Kor");
    }

    const lineMap = new Map<
      string,
      {
        employeeId: string;
        taxId: string | null;
        passportNumber: string | null;
        fullNameTh: string | null;
        fullNameEn: string | null;
        pnd1IncomeType: string;
        grossAmount: number;
        pitWht: number;
        slipIds: string[];
        months: string[];
      }
    >();
    for (const row of slipRows) {
      const key = `${row.employeeId}:${row.pnd1IncomeType}`;
      const current =
        lineMap.get(key) ??
        {
          employeeId: row.employeeId,
          taxId: row.taxId,
          passportNumber: row.passportNumber,
          fullNameTh: row.fullNameTh,
          fullNameEn: row.fullNameEn,
          pnd1IncomeType: row.pnd1IncomeType,
          grossAmount: 0,
          pitWht: 0,
          slipIds: [],
          months: [],
        };
      current.grossAmount += Number(row.grossAmount);
      current.pitWht += Number(row.pitWht);
      current.slipIds.push(row.slipId);
      const month = row.payDate.slice(0, 7);
      if (!current.months.includes(month)) current.months.push(month);
      lineMap.set(key, current);
    }

    const lines = [...lineMap.values()];
    const totalGross = lines.reduce((sum, row) => sum + row.grossAmount, 0);
    const totalWht = lines.reduce((sum, row) => sum + row.pitWht, 0);
    if (money(totalWht) !== (monthlyTotals?.totalWht ?? "0.00")) {
      throw new Error("PND.1 Kor total WHT does not match monthly PND.1 filings");
    }

    const [filing] = await tx
      .insert(pndFilings)
      .values({
        orgId: data.orgId,
        establishmentId: establishment.id,
        formType: "PND1KOR",
        taxPeriod,
        totalPayees: lines.length,
        totalGrossAmount: money(totalGross),
        totalWhtAmount: money(totalWht),
        payload: {
          source: "phase_11_pnd1_kor_draft_builder",
          sourceUrls: [
            "https://www.rd.go.th/fileadmin/download/english_form/frm_pnd1.pdf",
            "https://www.rd.go.th/fileadmin/download/english_form/frm_pnd1_attach.pdf",
            "https://www.rd.go.th/english/6045.html",
          ],
          retrievalDate: "2026-05-16",
          monthlyPnd1TotalWht: monthlyTotals?.totalWht ?? "0.00",
          lines: lines.map((row) => ({
            slipIds: row.slipIds,
            employeeId: row.employeeId,
            taxpayerId: row.taxId ?? row.passportNumber,
            fullName: row.fullNameTh ?? row.fullNameEn,
            incomeType: row.pnd1IncomeType,
            months: row.months.sort(),
            grossAmount: money(row.grossAmount),
            pitWht: money(row.pitWht),
          })),
        },
      })
      .returning();

    return { filing, lineCount: slipRows.length };
  });
}

export async function buildSsoFilingDraft(data: {
  orgId: string;
  taxMonth: string;
}) {
  validateTaxMonth(data.taxMonth);
  const establishment = await ensureHeadOfficeEstablishment(data.orgId);

  return db.transaction(async (tx) => {
    await assertPayrollPeriodUnlocked(tx as DbConnection, data);
    await tx.execute(sql`LOCK TABLE sso_filings IN SHARE ROW EXCLUSIVE MODE`);

    const [existing] = await tx
      .select({ id: ssoFilings.id })
      .from(ssoFilings)
      .where(
        and(
          eq(ssoFilings.orgId, data.orgId),
          eq(ssoFilings.establishmentId, establishment.id),
          eq(ssoFilings.taxMonth, data.taxMonth),
          eq(ssoFilings.isAmendment, false)
        )
      )
      .limit(1);
    if (existing) throw new Error("SSO draft already exists for this month");

    const slipRows = await tx
      .select({
        slipId: paySlips.id,
        employeeId: employees.id,
        fullNameTh: employees.fullNameTh,
        fullNameEn: employees.fullNameEn,
        taxId: employees.taxId,
        grossSalary: paySlips.grossSalary,
        ssoEmployee: paySlips.ssoEmployee,
        ssoEmployer: paySlips.ssoEmployer,
      })
      .from(paySlips)
      .innerJoin(payRuns, eq(payRuns.id, paySlips.payRunId))
      .innerJoin(employees, eq(employees.id, paySlips.employeeId))
      .where(
        and(
          eq(paySlips.orgId, data.orgId),
          eq(paySlips.establishmentId, establishment.id),
          sql`to_char(${payRuns.payDate}, 'YYYY-MM') = ${data.taxMonth}`,
          sql`${payRuns.status} IN ('approved', 'paid')`,
          sql`(${paySlips.ssoEmployee} > 0 OR ${paySlips.ssoEmployer} > 0)`
        )
      )
      .orderBy(employees.fullNameTh, employees.fullNameEn);

    if (slipRows.length === 0) {
      throw new Error("No SSO-eligible pay slips found for this month");
    }

    const totalEmployee = slipRows.reduce((sum, row) => sum + Number(row.ssoEmployee), 0);
    const totalEmployer = slipRows.reduce((sum, row) => sum + Number(row.ssoEmployer), 0);
    const [filing] = await tx
      .insert(ssoFilings)
      .values({
        orgId: data.orgId,
        establishmentId: establishment.id,
        taxMonth: data.taxMonth,
        totalEmployees: slipRows.length,
        totalEmployeeContribution: money(totalEmployee),
        totalEmployerContribution: money(totalEmployer),
        payload: {
          source: "phase_11_sso_draft_builder",
          sourceUrls: [
            "https://catalog.sso.go.th/en/dataset/?license_id=%E0%B8%AD%E0%B8%B7%E0%B9%88%E0%B8%99%E0%B9%86&organization=https-www-sso-go-th-wpr-main",
          ],
          retrievalDate: "2026-05-16",
          lines: slipRows.map((row) => ({
            slipId: row.slipId,
            employeeId: row.employeeId,
            taxpayerId: row.taxId,
            fullName: row.fullNameTh ?? row.fullNameEn,
            grossSalary: row.grossSalary,
            ssoEmployee: row.ssoEmployee,
            ssoEmployer: row.ssoEmployer,
          })),
        },
      })
      .returning();

    return { filing, lineCount: slipRows.length };
  });
}

export async function recordPnd1Remittance(data: {
  orgId: string;
  filingId: string;
  paymentDate: string;
  paidBy?: string;
}) {
  return db.transaction(async (tx) => {
    const [filing] = await tx
      .select()
      .from(pndFilings)
      .where(and(eq(pndFilings.orgId, data.orgId), eq(pndFilings.id, data.filingId)))
      .for("update")
      .limit(1);
    if (!filing) throw new Error("PND.1 filing not found");
    if (filing.formType !== "PND1") throw new Error("Only PND.1 payroll remittance is supported here");
    if (filing.paidAt) throw new Error("PND.1 filing is already marked paid");
    if (filing.filingStatus !== "accepted") {
      throw new Error("Only accepted PND.1 filings can be paid");
    }

    await assertPayrollPeriodUnlocked(tx as DbConnection, {
      orgId: data.orgId,
      taxMonth: filing.taxPeriod,
    });
    await lockGlPostingPeriodForPayrollDate(tx as DbConnection, data.orgId, data.paymentDate);
    await assertGlPeriodUnlocked(tx as DbConnection, {
      orgId: data.orgId,
      payDate: data.paymentDate,
    });

    const journalEntry = await postPnd1RemittanceJournalEntry(tx as DbConnection, {
      orgId: data.orgId,
      filingId: data.filingId,
      paymentDate: data.paymentDate,
      createdByUserId: data.paidBy,
      updateSourceState: false,
    });

    const [updated] = await tx
      .update(pndFilings)
      .set({ paidAt: new Date(`${data.paymentDate}T12:00:00+07:00`), updatedAt: new Date() })
      .where(and(eq(pndFilings.orgId, data.orgId), eq(pndFilings.id, data.filingId)))
      .returning();

    await enqueuePostingOutbox({
      orgId: data.orgId,
      sourceEntityType: "pnd_filing",
      sourceEntityId: data.filingId,
      eventType: "payment",
      postingDate: data.paymentDate,
      payload: { paymentDate: data.paymentDate, createdByUserId: data.paidBy ?? null },
      tx: tx as DbConnection,
    });

    await tx.insert(auditLog).values({
      orgId: data.orgId,
      entityType: "pnd_filing",
      entityId: data.filingId,
      action: "update",
      actorId: isAuditActorId(data.paidBy) ? data.paidBy : null,
      oldValue: {
        paidAt: filing.paidAt,
        filingStatus: filing.filingStatus,
      },
      newValue: {
        event: "payroll_pnd1_remittance_recorded",
        paidAt: updated.paidAt,
        paymentDate: data.paymentDate,
        amount: updated.totalWhtAmount,
        journalEntryId: journalEntry.id,
      },
    });

    return updated;
  });
}

export async function recordSsoRemittance(data: {
  orgId: string;
  filingId: string;
  paymentDate: string;
  paidBy?: string;
}) {
  return db.transaction(async (tx) => {
    const [filing] = await tx
      .select()
      .from(ssoFilings)
      .where(and(eq(ssoFilings.orgId, data.orgId), eq(ssoFilings.id, data.filingId)))
      .for("update")
      .limit(1);
    if (!filing) throw new Error("SSO filing not found");
    if (filing.paidAt || hasSsoRemittancePayload(filing.payload)) {
      throw new Error("SSO filing is already marked paid");
    }
    if (filing.filingStatus !== "accepted") {
      throw new Error("Only accepted SSO filings can be paid");
    }

    await assertPayrollPeriodUnlocked(tx as DbConnection, {
      orgId: data.orgId,
      taxMonth: filing.taxMonth,
    });
    await lockGlPostingPeriodForPayrollDate(tx as DbConnection, data.orgId, data.paymentDate);
    await assertGlPeriodUnlocked(tx as DbConnection, {
      orgId: data.orgId,
      payDate: data.paymentDate,
    });

    const amount = money(
      Number(filing.totalEmployeeContribution ?? "0") +
        Number(filing.totalEmployerContribution ?? "0")
    );
    if (Number(amount) <= 0) {
      throw new Error("SSO filing has no contributions to remit");
    }

    const journalEntry = await postSsoRemittanceJournalEntry(tx as DbConnection, {
      orgId: data.orgId,
      filingId: data.filingId,
      paymentDate: data.paymentDate,
      createdByUserId: data.paidBy,
      updateSourceState: false,
    });

    const [updated] = await tx
      .update(ssoFilings)
      .set({
        paidAt: new Date(`${data.paymentDate}T12:00:00+07:00`),
        payload: {
          ...(filing.payload && typeof filing.payload === "object" && !Array.isArray(filing.payload)
            ? filing.payload
            : {}),
          remittance: {
            paymentDate: data.paymentDate,
            postedAt: new Date().toISOString(),
            amount,
          },
        },
        updatedAt: new Date(),
      })
      .where(and(eq(ssoFilings.orgId, data.orgId), eq(ssoFilings.id, data.filingId)))
      .returning();

    await enqueuePostingOutbox({
      orgId: data.orgId,
      sourceEntityType: "sso_filing",
      sourceEntityId: data.filingId,
      eventType: "payment",
      postingDate: data.paymentDate,
      payload: {
        paymentDate: data.paymentDate,
        amount,
        createdByUserId: data.paidBy ?? null,
      },
      tx: tx as DbConnection,
    });

    await tx.insert(auditLog).values({
      orgId: data.orgId,
      entityType: "sso_filing",
      entityId: data.filingId,
      action: "update",
      actorId: isAuditActorId(data.paidBy) ? data.paidBy : null,
      oldValue: {
        paidAt: filing.paidAt,
        filingStatus: filing.filingStatus,
        ssoReferenceNumber: filing.ssoReferenceNumber,
      },
      newValue: {
        event: "payroll_sso_remittance_recorded",
        paidAt: updated.paidAt,
        paymentDate: data.paymentDate,
        amount,
        journalEntryId: journalEntry.id,
      },
    });

    return updated;
  });
}
