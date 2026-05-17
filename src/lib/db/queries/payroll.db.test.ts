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
let createEmployee: typeof import("./payroll").createEmployee;
let createEmployeeAllowance: typeof import("./payroll").createEmployeeAllowance;
let createDraftPayRun: typeof import("./payroll").createDraftPayRun;
let approvePayRun: typeof import("./payroll").approvePayRun;
let buildPnd1Draft: typeof import("./payroll").buildPnd1Draft;
let buildPnd1KorDraft: typeof import("./payroll").buildPnd1KorDraft;
let buildSsoFilingDraft: typeof import("./payroll").buildSsoFilingDraft;
let getActiveSsoConfig: typeof import("./payroll").getActiveSsoConfig;
let getPayrollDashboard: typeof import("./payroll").getPayrollDashboard;
let getPayrollEmployeeDetail: typeof import("./payroll").getPayrollEmployeeDetail;
let getPayrollEmployees: typeof import("./payroll").getPayrollEmployees;
let getPayrollPayRunDetail: typeof import("./payroll").getPayrollPayRunDetail;
let markPayrollPndFilingAccepted: typeof import("./payroll").markPayrollPndFilingAccepted;
let markPayrollPndFilingSubmitted: typeof import("./payroll").markPayrollPndFilingSubmitted;
let markPayrollSsoFilingAccepted: typeof import("./payroll").markPayrollSsoFilingAccepted;
let markPayrollSsoFilingSubmitted: typeof import("./payroll").markPayrollSsoFilingSubmitted;
let recordPayRunPayment: typeof import("./payroll").recordPayRunPayment;
let recordPnd1Remittance: typeof import("./payroll").recordPnd1Remittance;
let recordSsoRemittance: typeof import("./payroll").recordSsoRemittance;
let processPostingOutboxRow: typeof import("./posting-outbox").processPostingOutboxRow;

beforeAll(async () => {
  await resetTestDb(pool);
  await migrateTestDb(pool);
  vi.doMock("../index", () => ({ db: testDb }));
  ({
    buildPnd1Draft,
    buildPnd1KorDraft,
    buildSsoFilingDraft,
    approvePayRun,
    createEmployeeAllowance,
    createDraftPayRun,
    createEmployee,
    getActiveSsoConfig,
    getPayrollDashboard,
    getPayrollEmployeeDetail,
    getPayrollEmployees,
    getPayrollPayRunDetail,
    markPayrollPndFilingAccepted,
    markPayrollPndFilingSubmitted,
    markPayrollSsoFilingAccepted,
    markPayrollSsoFilingSubmitted,
    recordPayRunPayment,
    recordPnd1Remittance,
    recordSsoRemittance,
  } = await import("./payroll"));
  ({ processPostingOutboxRow } = await import("./posting-outbox"));
});

afterAll(async () => {
  await resetTestDb(pool);
  await pool.end();
});

beforeEach(async () => {
  await testDb.execute(sql`
    TRUNCATE TABLE
      journal_lines,
      journal_entries,
      posting_exceptions,
      posting_outbox,
      gl_accounts,
      audit_log,
      period_locks,
      pay_slips,
      sso_filings,
      pnd_filings,
      pay_runs,
      employee_allowances,
      employees,
      sso_config,
      pit_standard_deductions,
      pit_brackets,
      establishments,
      documents,
      organizations
    CASCADE
  `);
});

async function createHeadOffice(orgId: string) {
  const [establishment] = await testDb
    .insert(schema.establishments)
    .values({
      orgId,
      branchNumber: "00000",
      nameEn: "Head Office",
      isHeadOffice: true,
      vatRegistered: true,
    })
    .returning();
  return establishment;
}

async function seedPayrollTaxConfig() {
  await testDb.insert(schema.pitBrackets).values([
    {
      effectiveFrom: "2026-01-01",
      lowerBound: "0.00",
      upperBound: "150000.00",
      marginalRate: "0.0000",
      cumulativeTaxAtLowerBound: "0.00",
      sourceCitation: "RD PIT rates page, retrieved 2026-05-16",
    },
    {
      effectiveFrom: "2026-01-01",
      lowerBound: "150000.00",
      upperBound: "300000.00",
      marginalRate: "0.0500",
      cumulativeTaxAtLowerBound: "0.00",
      sourceCitation: "RD PIT rates page, retrieved 2026-05-16",
    },
    {
      effectiveFrom: "2026-01-01",
      lowerBound: "300000.00",
      upperBound: "500000.00",
      marginalRate: "0.1000",
      cumulativeTaxAtLowerBound: "7500.00",
      sourceCitation: "RD PIT rates page, retrieved 2026-05-16",
    },
    {
      effectiveFrom: "2026-01-01",
      lowerBound: "500000.00",
      upperBound: "750000.00",
      marginalRate: "0.1500",
      cumulativeTaxAtLowerBound: "27500.00",
      sourceCitation: "RD PIT rates page, retrieved 2026-05-16",
    },
    {
      effectiveFrom: "2026-01-01",
      lowerBound: "750000.00",
      upperBound: "1000000.00",
      marginalRate: "0.2000",
      cumulativeTaxAtLowerBound: "65000.00",
      sourceCitation: "RD PIT rates page, retrieved 2026-05-16",
    },
    {
      effectiveFrom: "2026-01-01",
      lowerBound: "1000000.00",
      upperBound: "2000000.00",
      marginalRate: "0.2500",
      cumulativeTaxAtLowerBound: "115000.00",
      sourceCitation: "RD PIT rates page, retrieved 2026-05-16",
    },
    {
      effectiveFrom: "2026-01-01",
      lowerBound: "2000000.00",
      upperBound: "5000000.00",
      marginalRate: "0.3000",
      cumulativeTaxAtLowerBound: "365000.00",
      sourceCitation: "RD PIT rates page, retrieved 2026-05-16",
    },
    {
      effectiveFrom: "2026-01-01",
      lowerBound: "5000000.00",
      upperBound: null,
      marginalRate: "0.3500",
      cumulativeTaxAtLowerBound: "1265000.00",
      sourceCitation: "RD PIT rates page, retrieved 2026-05-16",
    },
  ]);

  await testDb.insert(schema.pitStandardDeductions).values({
    effectiveFrom: "2026-01-01",
    employmentExpensePct: "0.5000",
    employmentExpenseCap: "100000.00",
    personalAllowance: "60000.00",
    spouseAllowance: "60000.00",
    childPre2018Allowance: "30000.00",
    childPost2018SecondPlusAllowance: "60000.00",
    parentAllowancePer: "30000.00",
    sourceCitation: "RD deduction and allowance pages, retrieved 2026-05-16",
  });

  await testDb.insert(schema.ssoConfig).values({
    effectiveFrom: "2026-01-01",
    employeeRate: "0.0500",
    employerRate: "0.0500",
    insurableWageFloor: "1650.00",
    insurableWageCap: "15000.00",
    monthlyMaxPerSide: "750.00",
    sourceCitation: "SSO Section 33 contribution assumption pending official validation",
  });
}

describe("payroll foundation", () => {
  it("reads the active SSO config for filing-rate visibility", async () => {
    await seedPayrollTaxConfig();

    const config = await getActiveSsoConfig("2026-05-31");

    expect(config).toMatchObject({
      employeeRate: "0.0500",
      employerRate: "0.0500",
      insurableWageFloor: "1650.00",
      insurableWageCap: "15000.00",
      monthlyMaxPerSide: "750.00",
      sourceCitation: "SSO Section 33 contribution assumption pending official validation",
    });
  });

  it("returns null when no SSO config is active", async () => {
    await seedPayrollTaxConfig();

    await expect(getActiveSsoConfig("2025-12-31")).resolves.toBeNull();
  });

  it("creates an employee with default annual allowance row and dashboard summary", async () => {
    const org = await createTestOrg(testDb);
    const employee = await createEmployee({
      orgId: org.id,
      fullNameEn: "Jane Payroll",
      taxId: "1234567890123",
      position: "Operations",
      startDate: "2026-05-01",
      baseMonthlySalary: "50000.00",
      salaryEffectiveFrom: "2026-05-01",
    });

    expect(employee.fullNameEn).toBe("Jane Payroll");
    expect(employee.baseMonthlySalary).toBe("50000.00");

    const allowances = await testDb.select().from(schema.employeeAllowances);
    expect(allowances).toHaveLength(1);
    expect(allowances[0].personalAllowance).toBe("60000.00");

    const dashboard = await getPayrollDashboard(org.id);
    expect(dashboard.employeeSummary.activeEmployeeCount).toBe(1);
    expect(dashboard.recentEmployees[0].branchNumber).toBe("00000");
  });

  it("lists employee allowance readiness and records forward allowance declarations", async () => {
    const org = await createTestOrg(testDb);
    const otherOrg = await createTestOrg(testDb);
    const employee = await createEmployee({
      orgId: org.id,
      fullNameEn: "Allowance Employee",
      position: "Finance",
      startDate: "2026-05-01",
    });
    const otherEmployee = await createEmployee({
      orgId: otherOrg.id,
      fullNameEn: "Other Payroll",
      startDate: "2026-05-01",
    });

    const allowance = await createEmployeeAllowance({
      orgId: org.id,
      employeeId: employee.id,
      taxYear: 2026,
      effectiveFromMonth: "2026-06-01",
      spouseAllowance: "60000.00",
      childCountPre2018: 1,
      recordedByUserId: "user_payroll_admin",
    });

    const employees = await getPayrollEmployees(org.id);
    expect(employees).toHaveLength(1);
    expect(employees[0].allowanceCount).toBe(2);
    expect(employees[0].latestAllowanceYear).toBe(2026);

    const detail = await getPayrollEmployeeDetail(org.id, employee.id);
    expect(detail?.employee.fullNameEn).toBe("Allowance Employee");
    expect(detail?.allowances.map((row) => row.id)).toContain(allowance.id);
    expect(detail?.allowances[0].effectiveFromMonth).toBe("2026-06-01");
    expect(detail?.recentSlips).toHaveLength(0);
    await expect(getPayrollEmployeeDetail(org.id, otherEmployee.id)).resolves.toBeNull();
    await getPayrollEmployeeDetail(org.id, employee.id);

    const readAuditRows = await testDb
      .select()
      .from(schema.auditLog)
      .where(sql`
        ${schema.auditLog.entityType} = 'employee'
        AND ${schema.auditLog.entityId} = ${employee.id}
        AND ${schema.auditLog.action} = 'read_pii'
      `);
    expect(readAuditRows).toHaveLength(1);
    expect(readAuditRows[0].newValue).toMatchObject({
      event: "payroll_sensitive_read",
      readFieldSetKey:
        "allowance_declarations,base_monthly_salary,prior_employer_ytd,recent_pay_slips",
      reason: "employee_payroll_detail_display",
      allowanceCount: 2,
      recentSlipCount: 0,
    });

    const auditRows = await testDb
      .select()
      .from(schema.auditLog)
      .where(sql`${schema.auditLog.entityId} = ${allowance.id}`);
    expect(auditRows[0].newValue).toMatchObject({
      event: "employee_allowance_recorded",
      employeeId: employee.id,
      taxYear: 2026,
    });
  });

  it("scopes payroll sensitive-read audit deduplication by actor", async () => {
    const org = await createTestOrg(testDb);
    const employee = await createEmployee({
      orgId: org.id,
      fullNameEn: "Actor Audit Employee",
      startDate: "2026-05-01",
      baseMonthlySalary: "42000.00",
      salaryEffectiveFrom: "2026-05-01",
    });
    const [actorOne, actorTwo] = await testDb
      .insert(schema.users)
      .values([
        {
          orgId: org.id,
          name: "Payroll Actor One",
          email: "payroll-actor-one@example.com",
          role: "accountant",
        },
        {
          orgId: org.id,
          name: "Payroll Actor Two",
          email: "payroll-actor-two@example.com",
          role: "accountant",
        },
      ])
      .returning();

    await getPayrollEmployeeDetail(org.id, employee.id, { actorId: actorOne.id });
    await getPayrollEmployeeDetail(org.id, employee.id, { actorId: actorOne.id });
    await getPayrollEmployeeDetail(org.id, employee.id, { actorId: actorTwo.id });

    const readAuditRows = await testDb
      .select()
      .from(schema.auditLog)
      .where(sql`
        ${schema.auditLog.entityType} = 'employee'
        AND ${schema.auditLog.entityId} = ${employee.id}
        AND ${schema.auditLog.action} = 'read_pii'
      `);
    expect(readAuditRows).toHaveLength(2);
    expect(readAuditRows.map((row) => row.actorId).sort()).toEqual(
      [actorOne.id, actorTwo.id].sort()
    );
  });

  it("uses employee base monthly salary when draft pay-run override is zero", async () => {
    const org = await createTestOrg(testDb);
    await seedPayrollTaxConfig();
    await createEmployee({
      orgId: org.id,
      fullNameEn: "Salary Master",
      position: "Operations",
      startDate: "2026-05-01",
      baseMonthlySalary: "42000.00",
      salaryEffectiveFrom: "2026-05-01",
    });

    const result = await createDraftPayRun({
      orgId: org.id,
      periodStart: "2026-05-01",
      periodEnd: "2026-05-31",
      payDate: "2026-05-31",
      defaultGrossSalary: "0.00",
    });

    expect(result.slips[0].grossSalary).toBe("42000.00");
    expect(result.slips[0].netPay).not.toBe("0.00");
  });

  it("enforces same-org establishment and employee allowance guardrails", async () => {
    const org = await createTestOrg(testDb);
    const otherOrg = await createTestOrg(testDb);
    const otherEstablishment = await createHeadOffice(otherOrg.id);
    const employee = await createEmployee({
      orgId: org.id,
      fullNameEn: "Same Org",
      startDate: "2026-05-01",
    });

    await expect(
      testDb.insert(schema.employees).values({
        orgId: org.id,
        establishmentId: otherEstablishment.id,
        fullNameEn: "Cross Org",
        startDate: "2026-05-01",
      })
    ).rejects.toThrow(/Failed query/);

    await expect(
      testDb.insert(schema.employeeAllowances).values({
        orgId: otherOrg.id,
        employeeId: employee.id,
        taxYear: 2026,
        effectiveFromMonth: "2026-01-01",
      })
    ).rejects.toThrow(/Failed query/);
  });

  it("keeps pay slips scoped to the same org as pay run and employee", async () => {
    const org = await createTestOrg(testDb);
    const otherOrg = await createTestOrg(testDb);
    const establishment = await createHeadOffice(org.id);
    const otherEmployee = await createEmployee({
      orgId: otherOrg.id,
      fullNameEn: "Other Employee",
      startDate: "2026-05-01",
    });
    const [payRun] = await testDb
      .insert(schema.payRuns)
      .values({
        orgId: org.id,
        establishmentId: establishment.id,
        periodStart: "2026-05-01",
        periodEnd: "2026-05-31",
        payDate: "2026-05-31",
      })
      .returning();

    await expect(
      testDb.insert(schema.paySlips).values({
        orgId: org.id,
        establishmentId: establishment.id,
        payRunId: payRun.id,
        employeeId: otherEmployee.id,
        grossSalary: "50000.00",
        pitWht: "0.00",
        ssoEmployee: "0.00",
        ssoEmployer: "0.00",
        netPay: "50000.00",
      })
    ).rejects.toThrow(/Failed query/);
  });

  it("generates a draft pay run with PIT true-up, SSO, net pay, and dashboard totals", async () => {
    const org = await createTestOrg(testDb);
    await seedPayrollTaxConfig();
    await createEmployee({
      orgId: org.id,
      fullNameEn: "Payroll Calculator",
      taxId: "1234567890123",
      position: "Manager",
      startDate: "2026-01-01",
    });

    const result = await createDraftPayRun({
      orgId: org.id,
      periodStart: "2026-01-01",
      periodEnd: "2026-01-31",
      payDate: "2026-01-31",
      defaultGrossSalary: "50000.00",
    });

    expect(result.slips).toHaveLength(1);
    expect(result.slips[0].grossSalary).toBe("50000.00");
    expect(result.slips[0].pitWht).toBe("1716.67");
    expect(result.slips[0].ssoEmployee).toBe("750.00");
    expect(result.slips[0].ssoEmployer).toBe("750.00");
    expect(result.slips[0].netPay).toBe("47533.33");
    expect(result.slips[0].payload).toMatchObject({
      source: "phase_11_draft_pay_run_calculator",
      pit: { estimatedAnnualPit: 20600, payPeriodsRemainingIncludingCurrent: 12 },
      sso: { insurableWage: "15000.00" },
    });

    const dashboard = await getPayrollDashboard(org.id);
    expect(dashboard.payRunSummary.draftPayRunCount).toBe(1);
    expect(dashboard.slipSummary.pitWht).toBe("1716.67");
    expect(dashboard.recentPayRuns[0].slipCount).toBe(1);
  });

  it("returns pay-run detail with scoped slip preview and no cross-org access", async () => {
    const org = await createTestOrg(testDb);
    const otherOrg = await createTestOrg(testDb);
    await seedPayrollTaxConfig();
    await createEmployee({
      orgId: org.id,
      fullNameEn: "Detail Employee",
      position: "Payroll Detail",
      startDate: "2026-01-01",
      baseMonthlySalary: "50000.00",
      salaryEffectiveFrom: "2026-01-01",
    });

    const result = await createDraftPayRun({
      orgId: org.id,
      periodStart: "2026-01-01",
      periodEnd: "2026-01-31",
      payDate: "2026-01-31",
      defaultGrossSalary: "0.00",
      notes: "January payroll",
    });

    const detail = await getPayrollPayRunDetail(org.id, result.payRun.id);
    expect(detail?.payRun.notes).toBe("January payroll");
    expect(detail?.payRun.branchNumber).toBe("00000");
    expect(detail?.summary).toMatchObject({
      slipCount: 1,
      grossSalary: "50000.00",
      pitWht: "1716.67",
      ssoEmployee: "750.00",
      ssoEmployer: "750.00",
      netPay: "47533.33",
    });
    expect(detail?.slips).toHaveLength(1);
    expect(detail?.slips[0]).toMatchObject({
      employeeNameEn: "Detail Employee",
      position: "Payroll Detail",
      pnd1IncomeType: "40_1",
      grossSalary: "50000.00",
      netPay: "47533.33",
    });
    expect(Object.keys(detail?.slips[0] ?? {})).not.toContain("taxId");
    expect(Object.keys(detail?.slips[0] ?? {})).not.toContain("bankAccountNumber");
    await expect(getPayrollPayRunDetail(otherOrg.id, result.payRun.id)).resolves.toBeNull();
    await getPayrollPayRunDetail(org.id, result.payRun.id);

    const readAuditRows = await testDb
      .select()
      .from(schema.auditLog)
      .where(sql`
        ${schema.auditLog.entityType} = 'pay_run'
        AND ${schema.auditLog.entityId} = ${result.payRun.id}
        AND ${schema.auditLog.action} = 'read_pii'
      `);
    expect(readAuditRows).toHaveLength(1);
    expect(readAuditRows[0].newValue).toMatchObject({
      event: "payroll_sensitive_read",
      readFieldSetKey:
        "pay_slip_gross_salary,pay_slip_net_pay,pay_slip_sso,pay_slip_tax_withholding",
      reason: "pay_run_detail_display",
      slipCount: 1,
      status: "draft",
    });
  });

  it("applies payroll category allocation rules to accrual expense lines only", async () => {
    const org = await createTestOrg(testDb);
    await seedPayrollTaxConfig();
    const [project] = await testDb
      .insert(schema.projects)
      .values({
        orgId: org.id,
        code: "PAYROLL-OPS",
        nameEn: "Payroll Operations",
      })
      .returning();
    const [rule] = await testDb
      .insert(schema.allocationRules)
      .values({
        orgId: org.id,
        ruleName: "Payroll gross salary split",
        sourceType: "category",
        sourceKey: "payroll:gross_salary",
      })
      .returning();
    await testDb.insert(schema.allocationRuleTargets).values({
      orgId: org.id,
      allocationRuleId: rule.id,
      projectId: project.id,
      percentage: "1.0000",
    });

    await createEmployee({
      orgId: org.id,
      fullNameEn: "Allocated Payroll",
      startDate: "2026-01-01",
      baseMonthlySalary: "50000.00",
      salaryEffectiveFrom: "2026-01-01",
    });
    const result = await createDraftPayRun({
      orgId: org.id,
      periodStart: "2026-01-01",
      periodEnd: "2026-01-31",
      payDate: "2026-01-31",
      defaultGrossSalary: "0.00",
    });

    await approvePayRun({
      orgId: org.id,
      payRunId: result.payRun.id,
      approvedBy: "payroll-reviewer",
    });

    const lines = await testDb
      .select({
        accountCode: schema.glAccounts.accountCode,
        debitAmount: schema.journalLines.debitAmount,
        creditAmount: schema.journalLines.creditAmount,
        projectId: schema.journalLines.projectId,
      })
      .from(schema.journalLines)
      .innerJoin(
        schema.glAccounts,
        sql`${schema.glAccounts.id} = ${schema.journalLines.accountId}`
      )
      .innerJoin(
        schema.journalEntries,
        sql`${schema.journalEntries.id} = ${schema.journalLines.journalEntryId}`
      )
      .where(sql`${schema.journalEntries.sourceEntityId} = ${result.payRun.id}
        AND ${schema.journalEntries.postingKind} = 'payroll_accrual'`)
      .orderBy(schema.journalLines.lineNumber);

    const salaryLines = lines.filter((line) => line.accountCode === "6110");
    expect(salaryLines).toEqual([
      {
        accountCode: "6110",
        debitAmount: "50000.00",
        creditAmount: "0.00",
        projectId: project.id,
      },
    ]);
    expect(
      lines
        .filter((line) => ["2156", "2157", "2158"].includes(line.accountCode))
        .every((line) => line.projectId === null)
    ).toBe(true);
  });

  it("blocks draft pay-run generation for non-monthly employees until period scheduling exists", async () => {
    const org = await createTestOrg(testDb);
    await seedPayrollTaxConfig();
    await createEmployee({
      orgId: org.id,
      fullNameEn: "Weekly Employee",
      startDate: "2026-01-01",
      payFrequency: "weekly",
      payPeriodsPerYear: 52,
    });

    await expect(
      createDraftPayRun({
        orgId: org.id,
        periodStart: "2026-01-01",
        periodEnd: "2026-01-31",
        payDate: "2026-01-31",
        defaultGrossSalary: "50000.00",
      })
    ).rejects.toThrow(/monthly employees only/);
  });

  it("builds PND.1 and SSO draft filings from generated pay slips", async () => {
    const org = await createTestOrg(testDb);
    await seedPayrollTaxConfig();
    await createEmployee({
      orgId: org.id,
      fullNameEn: "Payroll Filing",
      taxId: "1234567890123",
      position: "Manager",
      startDate: "2026-01-01",
    });

    const run = await createDraftPayRun({
      orgId: org.id,
      periodStart: "2026-01-01",
      periodEnd: "2026-01-31",
      payDate: "2026-01-31",
      defaultGrossSalary: "50000.00",
    });
    await approvePayRun({ orgId: org.id, payRunId: run.payRun.id, approvedBy: "user-payroll" });

    const pnd1 = await buildPnd1Draft({ orgId: org.id, taxMonth: "2026-01" });
    expect(pnd1.filing.formType).toBe("PND1");
    expect(pnd1.filing.totalPayees).toBe(1);
    expect(pnd1.filing.totalGrossAmount).toBe("50000.00");
    expect(pnd1.filing.totalWhtAmount).toBe("1716.67");
    expect(pnd1.filing.payload).toMatchObject({
      source: "phase_11_pnd1_draft_builder",
      lines: [{ taxpayerId: "1234567890123", incomeType: "40_1" }],
    });

    const [slip] = await testDb.select().from(schema.paySlips);
    expect(slip.pndFilingId).toBe(pnd1.filing.id);

    const sso = await buildSsoFilingDraft({ orgId: org.id, taxMonth: "2026-01" });
    expect(sso.filing.totalEmployees).toBe(1);
    expect(sso.filing.totalEmployeeContribution).toBe("750.00");
    expect(sso.filing.totalEmployerContribution).toBe("750.00");
    expect(sso.filing.payload).toMatchObject({
      source: "phase_11_sso_draft_builder",
      lines: [{ taxpayerId: "1234567890123", ssoEmployee: "750.00" }],
    });

    const dashboard = await getPayrollDashboard(org.id);
    expect(dashboard.recentPndFilings[0].formType).toBe("PND1");
    expect(dashboard.recentSsoFilings[0].taxMonth).toBe("2026-01");
  });

  it("marks payroll filings submitted and accepted with audit trail", async () => {
    const org = await createTestOrg(testDb);
    await seedPayrollTaxConfig();
    await createEmployee({
      orgId: org.id,
      fullNameEn: "Payroll Filing Workflow",
      taxId: "1234567890123",
      position: "Manager",
      startDate: "2026-01-01",
    });

    const run = await createDraftPayRun({
      orgId: org.id,
      periodStart: "2026-01-01",
      periodEnd: "2026-01-31",
      payDate: "2026-01-31",
      defaultGrossSalary: "50000.00",
    });
    await approvePayRun({ orgId: org.id, payRunId: run.payRun.id, approvedBy: "user-payroll" });
    const pnd1 = await buildPnd1Draft({ orgId: org.id, taxMonth: "2026-01" });
    const sso = await buildSsoFilingDraft({ orgId: org.id, taxMonth: "2026-01" });

    const submittedPnd = await markPayrollPndFilingSubmitted({
      orgId: org.id,
      filingId: pnd1.filing.id,
      rdReferenceNumber: "RD-REF-001",
    });
    expect(submittedPnd).toMatchObject({
      filingStatus: "submitted",
      rdReferenceNumber: "RD-REF-001",
    });
    expect(submittedPnd.submittedAt).toBeInstanceOf(Date);
    await expect(
      markPayrollPndFilingSubmitted({
        orgId: org.id,
        filingId: pnd1.filing.id,
        rdReferenceNumber: "RD-REF-002",
      })
    ).rejects.toThrow(/draft or rejected/);
    const acceptedPnd = await markPayrollPndFilingAccepted({
      orgId: org.id,
      filingId: pnd1.filing.id,
    });
    expect(acceptedPnd.filingStatus).toBe("accepted");
    expect(acceptedPnd.rdReferenceNumber).toBe("RD-REF-001");
    expect(acceptedPnd.acceptedAt).toBeInstanceOf(Date);

    const submittedSso = await markPayrollSsoFilingSubmitted({
      orgId: org.id,
      filingId: sso.filing.id,
      ssoReferenceNumber: "SSO-REF-001",
    });
    expect(submittedSso).toMatchObject({
      filingStatus: "submitted",
      ssoReferenceNumber: "SSO-REF-001",
    });
    expect(submittedSso.submittedAt).toBeInstanceOf(Date);
    const acceptedSso = await markPayrollSsoFilingAccepted({
      orgId: org.id,
      filingId: sso.filing.id,
    });
    expect(acceptedSso.filingStatus).toBe("accepted");
    expect(acceptedSso.ssoReferenceNumber).toBe("SSO-REF-001");
    expect(acceptedSso.acceptedAt).toBeInstanceOf(Date);

    const auditRows = await testDb
      .select()
      .from(schema.auditLog)
      .where(sql`${schema.auditLog.orgId} = ${org.id}`)
      .orderBy(schema.auditLog.createdAt);
    expect(auditRows.map((row) => (row.newValue as { event?: string })?.event)).toEqual(
      expect.arrayContaining([
        "payroll_pnd_filing_submitted",
        "payroll_pnd_filing_accepted",
        "payroll_sso_filing_submitted",
        "payroll_sso_filing_accepted",
      ])
    );
    const pndAcceptedAudit = auditRows.find(
      (row) => (row.newValue as { event?: string })?.event === "payroll_pnd_filing_accepted"
    );
    expect(
      (pndAcceptedAudit?.newValue as { submittedAt?: unknown; acceptedAt?: unknown })
        .submittedAt
    ).toBeTruthy();
    expect(
      (pndAcceptedAudit?.newValue as { submittedAt?: unknown; acceptedAt?: unknown })
        .acceptedAt
    ).toBeTruthy();
  });

  it("builds PND.1 Kor annual draft from monthly PND.1 totals", async () => {
    const org = await createTestOrg(testDb);
    await seedPayrollTaxConfig();
    await createEmployee({
      orgId: org.id,
      fullNameEn: "Annual Payroll Filing",
      taxId: "1234567890123",
      position: "Manager",
      startDate: "2026-01-01",
    });

    const run = await createDraftPayRun({
      orgId: org.id,
      periodStart: "2026-01-01",
      periodEnd: "2026-01-31",
      payDate: "2026-01-31",
      defaultGrossSalary: "50000.00",
    });
    await approvePayRun({ orgId: org.id, payRunId: run.payRun.id, approvedBy: "user-payroll" });
    await buildPnd1Draft({ orgId: org.id, taxMonth: "2026-01" });

    const annual = await buildPnd1KorDraft({ orgId: org.id, taxYear: 2026 });

    expect(annual.filing.formType).toBe("PND1KOR");
    expect(annual.filing.taxPeriod).toBe("2026");
    expect(annual.filing.totalPayees).toBe(1);
    expect(annual.filing.totalGrossAmount).toBe("50000.00");
    expect(annual.filing.totalWhtAmount).toBe("1716.67");
    expect(annual.filing.payload).toMatchObject({
      source: "phase_11_pnd1_kor_draft_builder",
      monthlyPnd1TotalWht: "1716.67",
      lines: [{ taxpayerId: "1234567890123", months: ["2026-01"] }],
    });
    await expect(buildPnd1KorDraft({ orgId: org.id, taxYear: 2026 })).rejects.toThrow(
      /already exists/
    );
  });

  it("posts approved pay runs to GL with payroll liabilities", async () => {
    const org = await createTestOrg(testDb);
    await seedPayrollTaxConfig();
    await createEmployee({
      orgId: org.id,
      fullNameEn: "GL Payroll",
      taxId: "1234567890123",
      startDate: "2026-01-01",
    });

    const run = await createDraftPayRun({
      orgId: org.id,
      periodStart: "2026-01-01",
      periodEnd: "2026-01-31",
      payDate: "2026-01-31",
      defaultGrossSalary: "50000.00",
    });
    await approvePayRun({
      orgId: org.id,
      payRunId: run.payRun.id,
      approvedBy: "user-payroll",
    });

    const journalRows = await testDb.execute(sql`
      SELECT je.entry_type, je.posting_kind, je.source_entity_id,
             je.total_debit, je.total_credit,
             ga.account_code, jl.debit_amount, jl.credit_amount
      FROM journal_entries je
      INNER JOIN journal_lines jl
        ON jl.journal_entry_id = je.id
        AND jl.org_id = je.org_id
      INNER JOIN gl_accounts ga
        ON ga.id = jl.account_id
        AND ga.org_id = jl.org_id
      WHERE je.source_entity_type = 'pay_run'
        AND je.source_entity_id = ${run.payRun.id}
        AND je.posting_kind = 'payroll_accrual'
      ORDER BY jl.line_number
    `);

    expect(journalRows.rows).toMatchObject([
      {
        entry_type: "auto_payroll",
        account_code: "6110",
        debit_amount: "50000.00",
        credit_amount: "0.00",
      },
      {
        entry_type: "auto_payroll",
        account_code: "6112",
        debit_amount: "750.00",
        credit_amount: "0.00",
      },
      {
        entry_type: "auto_payroll",
        account_code: "2156",
        debit_amount: "0.00",
        credit_amount: "1716.67",
      },
      {
        entry_type: "auto_payroll",
        account_code: "2157",
        debit_amount: "0.00",
        credit_amount: "1500.00",
      },
      {
        entry_type: "auto_payroll",
        account_code: "2158",
        debit_amount: "0.00",
        credit_amount: "47533.33",
      },
    ]);
    expect(journalRows.rows[0]).toMatchObject({
      total_debit: "50750.00",
      total_credit: "50750.00",
    });
  });

  it("posts payroll net pay and statutory remittances to GL", async () => {
    const org = await createTestOrg(testDb);
    await seedPayrollTaxConfig();
    await createEmployee({
      orgId: org.id,
      fullNameEn: "Paid Payroll",
      taxId: "1234567890123",
      startDate: "2026-01-01",
    });

    const run = await createDraftPayRun({
      orgId: org.id,
      periodStart: "2026-01-01",
      periodEnd: "2026-01-31",
      payDate: "2026-01-31",
      defaultGrossSalary: "50000.00",
    });
    await approvePayRun({ orgId: org.id, payRunId: run.payRun.id });
    const paidRun = await recordPayRunPayment({
      orgId: org.id,
      payRunId: run.payRun.id,
      paymentDate: "2026-02-01",
      paidBy: "user-payroll",
    });
    expect(paidRun.status).toBe("paid");

    const pnd1 = await buildPnd1Draft({ orgId: org.id, taxMonth: "2026-01" });
    await expect(
      recordPnd1Remittance({
        orgId: org.id,
        filingId: pnd1.filing.id,
        paymentDate: "2026-02-15",
      })
    ).rejects.toThrow(/accepted PND\.1 filings/);
    await markPayrollPndFilingSubmitted({
      orgId: org.id,
      filingId: pnd1.filing.id,
      rdReferenceNumber: "PND1-SUBMIT-001",
    });
    await markPayrollPndFilingAccepted({
      orgId: org.id,
      filingId: pnd1.filing.id,
      rdReferenceNumber: "PND1-ACCEPT-001",
    });
    const paidPnd1 = await recordPnd1Remittance({
      orgId: org.id,
      filingId: pnd1.filing.id,
      paymentDate: "2026-02-15",
      paidBy: "user-payroll",
    });
    expect(paidPnd1.paidAt).toBeTruthy();

    const sso = await buildSsoFilingDraft({ orgId: org.id, taxMonth: "2026-01" });
    await expect(
      recordSsoRemittance({
        orgId: org.id,
        filingId: sso.filing.id,
        paymentDate: "2026-02-15",
      })
    ).rejects.toThrow(/accepted SSO filings/);
    await markPayrollSsoFilingSubmitted({
      orgId: org.id,
      filingId: sso.filing.id,
      ssoReferenceNumber: "SSO-SUBMIT-001",
    });
    await markPayrollSsoFilingAccepted({
      orgId: org.id,
      filingId: sso.filing.id,
      ssoReferenceNumber: "SSO-ACCEPT-001",
    });
    const paidSso = await recordSsoRemittance({
      orgId: org.id,
      filingId: sso.filing.id,
      paymentDate: "2026-02-15",
      paidBy: "user-payroll",
    });
    expect(paidSso.paidAt).toBeTruthy();
    expect(paidSso.payload).toMatchObject({
      remittance: { paymentDate: "2026-02-15", amount: "1500.00" },
    });

    const outboxRows = await testDb
      .select()
      .from(schema.postingOutbox)
      .where(sql`${schema.postingOutbox.orgId} = ${org.id}`)
      .orderBy(schema.postingOutbox.sourceEntityType);
    expect(outboxRows).toEqual([
      expect.objectContaining({
        sourceEntityType: "pay_run",
        sourceEntityId: run.payRun.id,
        eventType: "payment",
        postingDate: "2026-02-01",
        postingStatus: "pending",
      }),
      expect.objectContaining({
        sourceEntityType: "pnd_filing",
        sourceEntityId: pnd1.filing.id,
        eventType: "payment",
        postingDate: "2026-02-15",
        postingStatus: "pending",
      }),
      expect.objectContaining({
        sourceEntityType: "sso_filing",
        sourceEntityId: sso.filing.id,
        eventType: "payment",
        postingDate: "2026-02-15",
        postingStatus: "pending",
      }),
    ]);

    for (const row of outboxRows) {
      const posted = await processPostingOutboxRow({
        orgId: org.id,
        postingOutboxId: row.id,
      });
      expect(posted.postingStatus).toBe("posted");
      expect(posted.journalEntryId).toBeTruthy();
    }

    const paymentCount = await testDb.execute(sql`
      SELECT COUNT(*)::int AS count
      FROM journal_entries
      WHERE org_id = ${org.id}
        AND posting_kind IN (
          'payroll_net_payment',
          'payroll_pnd1_remittance',
          'payroll_sso_remittance'
        )
    `);
    expect(paymentCount.rows[0]).toMatchObject({ count: 3 });

    await expect(
      recordPayRunPayment({
        orgId: org.id,
        payRunId: run.payRun.id,
        paymentDate: "2026-02-02",
      })
    ).rejects.toThrow(/already paid/);
    await expect(
      recordSsoRemittance({
        orgId: org.id,
        filingId: sso.filing.id,
        paymentDate: "2026-02-16",
      })
    ).rejects.toThrow(/already marked paid/);
    const [legacyPaidSso] = await testDb
      .insert(schema.ssoFilings)
      .values({
        orgId: org.id,
        establishmentId: sso.filing.establishmentId,
        taxMonth: "2026-03",
        filingStatus: "draft",
        totalEmployees: 1,
        totalEmployeeContribution: "750.00",
        totalEmployerContribution: "750.00",
        payload: {
          remittance: {
            paymentDate: "2026-04-15",
            amount: "1500.00",
          },
        },
      })
      .returning();
    await expect(
      recordSsoRemittance({
        orgId: org.id,
        filingId: legacyPaidSso.id,
        paymentDate: "2026-04-16",
      })
    ).rejects.toThrow(/already marked paid/);
    const [zeroSso] = await testDb
      .insert(schema.ssoFilings)
      .values({
        orgId: org.id,
        establishmentId: sso.filing.establishmentId,
        taxMonth: "2026-04",
        filingStatus: "draft",
        totalEmployees: 0,
        totalEmployeeContribution: "0.00",
        totalEmployerContribution: "0.00",
      })
      .returning();
    await markPayrollSsoFilingSubmitted({
      orgId: org.id,
      filingId: zeroSso.id,
      ssoReferenceNumber: "SSO-ZERO-SUBMIT",
    });
    await markPayrollSsoFilingAccepted({
      orgId: org.id,
      filingId: zeroSso.id,
      ssoReferenceNumber: "SSO-ZERO-ACCEPT",
    });
    await expect(
      recordSsoRemittance({
        orgId: org.id,
        filingId: zeroSso.id,
        paymentDate: "2026-05-15",
      })
    ).rejects.toThrow(/no contributions/);

    const auditRows = await testDb
      .select()
      .from(schema.auditLog)
      .where(sql`${schema.auditLog.orgId} = ${org.id}`);
    expect(auditRows.map((row) => (row.newValue as { event?: string })?.event)).toEqual(
      expect.arrayContaining([
        "pay_run_approved",
        "pay_run_payment_recorded",
        "payroll_pnd1_remittance_recorded",
        "payroll_sso_remittance_recorded",
      ])
    );

    const paymentRows = await testDb.execute(sql`
      SELECT je.source_entity_type, je.posting_kind, ga.account_code,
             jl.debit_amount, jl.credit_amount
      FROM journal_entries je
      INNER JOIN journal_lines jl
        ON jl.journal_entry_id = je.id
        AND jl.org_id = je.org_id
      INNER JOIN gl_accounts ga
        ON ga.id = jl.account_id
        AND ga.org_id = jl.org_id
      WHERE je.posting_kind IN (
        'payroll_net_payment',
        'payroll_pnd1_remittance',
        'payroll_sso_remittance'
      )
      ORDER BY je.posting_kind, jl.line_number
    `);

    expect(paymentRows.rows).toEqual([
      expect.objectContaining({
        posting_kind: "payroll_net_payment",
        account_code: "2158",
        debit_amount: "47533.33",
        credit_amount: "0.00",
      }),
      expect.objectContaining({
        posting_kind: "payroll_net_payment",
        account_code: "1111",
        debit_amount: "0.00",
        credit_amount: "47533.33",
      }),
      expect.objectContaining({
        posting_kind: "payroll_pnd1_remittance",
        account_code: "2156",
        debit_amount: "1716.67",
        credit_amount: "0.00",
      }),
      expect.objectContaining({
        posting_kind: "payroll_pnd1_remittance",
        account_code: "1111",
        debit_amount: "0.00",
        credit_amount: "1716.67",
      }),
      expect.objectContaining({
        posting_kind: "payroll_sso_remittance",
        account_code: "2157",
        debit_amount: "1500.00",
        credit_amount: "0.00",
      }),
      expect.objectContaining({
        posting_kind: "payroll_sso_remittance",
        account_code: "1111",
        debit_amount: "0.00",
        credit_amount: "1500.00",
      }),
    ]);
  });

  it("advances payroll source state when payment outbox rows are replayed directly", async () => {
    const org = await createTestOrg(testDb);
    await seedPayrollTaxConfig();
    await createEmployee({
      orgId: org.id,
      fullNameEn: "Outbox Payroll",
      taxId: "1234567890123",
      startDate: "2026-01-01",
    });

    const run = await createDraftPayRun({
      orgId: org.id,
      periodStart: "2026-01-01",
      periodEnd: "2026-01-31",
      payDate: "2026-01-31",
      defaultGrossSalary: "50000.00",
    });
    await approvePayRun({ orgId: org.id, payRunId: run.payRun.id });
    const pnd1 = await buildPnd1Draft({ orgId: org.id, taxMonth: "2026-01" });
    await markPayrollPndFilingSubmitted({
      orgId: org.id,
      filingId: pnd1.filing.id,
      rdReferenceNumber: "PND1-REPLAY-SUBMIT",
    });
    await markPayrollPndFilingAccepted({
      orgId: org.id,
      filingId: pnd1.filing.id,
      rdReferenceNumber: "PND1-REPLAY-ACCEPT",
    });
    const sso = await buildSsoFilingDraft({ orgId: org.id, taxMonth: "2026-01" });
    await markPayrollSsoFilingSubmitted({
      orgId: org.id,
      filingId: sso.filing.id,
      ssoReferenceNumber: "SSO-REPLAY-SUBMIT",
    });
    await markPayrollSsoFilingAccepted({
      orgId: org.id,
      filingId: sso.filing.id,
      ssoReferenceNumber: "SSO-REPLAY-ACCEPT",
    });

    const outboxRows = await testDb
      .insert(schema.postingOutbox)
      .values([
        {
          orgId: org.id,
          sourceEntityType: "pay_run",
          sourceEntityId: run.payRun.id,
          eventType: "payment",
          postingDate: "2026-02-01",
          payload: { paymentDate: "2026-02-01" },
        },
        {
          orgId: org.id,
          sourceEntityType: "pnd_filing",
          sourceEntityId: pnd1.filing.id,
          eventType: "payment",
          postingDate: "2026-02-15",
          payload: { paymentDate: "2026-02-15" },
        },
        {
          orgId: org.id,
          sourceEntityType: "sso_filing",
          sourceEntityId: sso.filing.id,
          eventType: "payment",
          postingDate: "2026-02-15",
          payload: { paymentDate: "2026-02-15" },
        },
      ])
      .returning();

    for (const row of outboxRows) {
      await processPostingOutboxRow({
        orgId: org.id,
        postingOutboxId: row.id,
      });
    }

    const [updatedRun] = await testDb
      .select()
      .from(schema.payRuns)
      .where(sql`${schema.payRuns.id} = ${run.payRun.id}`);
    const [updatedPnd1] = await testDb
      .select()
      .from(schema.pndFilings)
      .where(sql`${schema.pndFilings.id} = ${pnd1.filing.id}`);
    const [updatedSso] = await testDb
      .select()
      .from(schema.ssoFilings)
      .where(sql`${schema.ssoFilings.id} = ${sso.filing.id}`);

    expect(updatedRun.status).toBe("paid");
    expect(updatedPnd1.paidAt).toBeTruthy();
    expect(updatedSso.paidAt).toBeTruthy();
    expect(updatedSso.payload).toMatchObject({
      remittance: { paymentDate: "2026-02-15", amount: "1500.00" },
    });
  });

  it("blocks payroll payment and remittance posting in monthly or annual locked periods", async () => {
    const org = await createTestOrg(testDb);
    await seedPayrollTaxConfig();
    await createEmployee({
      orgId: org.id,
      fullNameEn: "Locked Payment",
      taxId: "1234567890123",
      startDate: "2026-01-01",
    });
    const run = await createDraftPayRun({
      orgId: org.id,
      periodStart: "2026-01-01",
      periodEnd: "2026-01-31",
      payDate: "2026-01-31",
      defaultGrossSalary: "50000.00",
    });
    await approvePayRun({ orgId: org.id, payRunId: run.payRun.id });
    const pnd1 = await buildPnd1Draft({ orgId: org.id, taxMonth: "2026-01" });
    const sso = await buildSsoFilingDraft({ orgId: org.id, taxMonth: "2026-01" });
    await markPayrollPndFilingSubmitted({
      orgId: org.id,
      filingId: pnd1.filing.id,
      rdReferenceNumber: "PND1-LOCK-SUBMIT",
    });
    await markPayrollPndFilingAccepted({
      orgId: org.id,
      filingId: pnd1.filing.id,
      rdReferenceNumber: "PND1-LOCK-ACCEPT",
    });
    await markPayrollSsoFilingSubmitted({
      orgId: org.id,
      filingId: sso.filing.id,
      ssoReferenceNumber: "SSO-LOCK-SUBMIT",
    });
    await markPayrollSsoFilingAccepted({
      orgId: org.id,
      filingId: sso.filing.id,
      ssoReferenceNumber: "SSO-LOCK-ACCEPT",
    });

    await testDb.insert(schema.periodLocks).values({
      orgId: org.id,
      domain: "gl",
      periodYear: 2026,
      periodMonth: 2,
      lockedByUserId: "user-lock",
      lockReason: "routine_close",
    });
    await expect(
      recordPayRunPayment({
        orgId: org.id,
        payRunId: run.payRun.id,
        paymentDate: "2026-02-01",
      })
    ).rejects.toThrow(/GL period is locked/);

    await testDb.delete(schema.periodLocks);
    await testDb.insert(schema.periodLocks).values({
      orgId: org.id,
      domain: "payroll",
      periodYear: 2026,
      periodMonth: null,
      lockedByUserId: "user-lock",
      lockReason: "annual_close",
    });
    await expect(
      recordPnd1Remittance({
        orgId: org.id,
        filingId: pnd1.filing.id,
        paymentDate: "2026-02-15",
      })
    ).rejects.toThrow(/Payroll period is locked/);
    await expect(
      recordSsoRemittance({
        orgId: org.id,
        filingId: sso.filing.id,
        paymentDate: "2026-02-15",
      })
    ).rejects.toThrow(/Payroll period is locked/);
  });

  it("blocks duplicate PND.1 drafts for the same month", async () => {
    const org = await createTestOrg(testDb);
    await seedPayrollTaxConfig();
    await createEmployee({
      orgId: org.id,
      fullNameEn: "Duplicate Filing",
      startDate: "2026-01-01",
    });
    const run = await createDraftPayRun({
      orgId: org.id,
      periodStart: "2026-01-01",
      periodEnd: "2026-01-31",
      payDate: "2026-01-31",
      defaultGrossSalary: "50000.00",
    });
    await approvePayRun({ orgId: org.id, payRunId: run.payRun.id });
    await buildPnd1Draft({ orgId: org.id, taxMonth: "2026-01" });

    await expect(
      buildPnd1Draft({ orgId: org.id, taxMonth: "2026-01" })
    ).rejects.toThrow(/already exists/);
  });

  it("does not build PND.1 drafts from unapproved pay runs", async () => {
    const org = await createTestOrg(testDb);
    await seedPayrollTaxConfig();
    await createEmployee({
      orgId: org.id,
      fullNameEn: "Unapproved Filing",
      startDate: "2026-01-01",
    });
    await createDraftPayRun({
      orgId: org.id,
      periodStart: "2026-01-01",
      periodEnd: "2026-01-31",
      payDate: "2026-01-31",
      defaultGrossSalary: "50000.00",
    });

    await expect(
      buildPnd1Draft({ orgId: org.id, taxMonth: "2026-01" })
    ).rejects.toThrow(/No unfiled pay slips/);
  });

  it("blocks payroll mutations in locked payroll periods", async () => {
    const org = await createTestOrg(testDb);
    await seedPayrollTaxConfig();
    await createEmployee({
      orgId: org.id,
      fullNameEn: "Locked Payroll",
      startDate: "2026-01-01",
    });
    await testDb.insert(schema.periodLocks).values({
      orgId: org.id,
      domain: "payroll",
      periodYear: 2026,
      periodMonth: 1,
      lockedByUserId: "user-lock",
      lockReason: "routine_close",
    });

    await expect(
      createDraftPayRun({
        orgId: org.id,
        periodStart: "2026-01-01",
        periodEnd: "2026-01-31",
        payDate: "2026-01-31",
        defaultGrossSalary: "50000.00",
      })
    ).rejects.toThrow(/locked/);
  });
});
