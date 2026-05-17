import { test, expect } from "../fixtures/auth";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";

const E2E_ORG_ID = "95aead7c-9942-474f-b48e-2ec5b46f10c9";

async function ensurePayrollHeadOffice() {
  const [existing] = await db
    .select()
    .from(schema.establishments)
    .where(
      sql`${schema.establishments.orgId} = ${E2E_ORG_ID}
        AND ${schema.establishments.branchNumber} = '00000'`
    )
    .limit(1);
  if (existing) return existing;

  const [created] = await db
    .insert(schema.establishments)
    .values({
      orgId: E2E_ORG_ID,
      branchNumber: "00000",
      nameEn: "Head Office",
      isHeadOffice: true,
      vatRegistered: true,
    })
    .returning();
  return created;
}

async function seedPayrollEmployeeFixture() {
  const headOffice = await ensurePayrollHeadOffice();
  const fixtureKey = `E2E Payroll Employee ${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const [employee] = await db
    .insert(schema.employees)
    .values({
      orgId: E2E_ORG_ID,
      establishmentId: headOffice.id,
      fullNameEn: fixtureKey,
      position: "Payroll QA",
      startDate: "2026-05-01",
      baseMonthlySalary: "42000.00",
      salaryEffectiveFrom: "2026-05-01",
      payFrequency: "monthly",
      payPeriodsPerYear: 12,
      socialSecurityEligible: true,
    })
    .returning();
  await db.insert(schema.employeeAllowances).values({
    orgId: E2E_ORG_ID,
    employeeId: employee.id,
    taxYear: 2026,
    effectiveFromMonth: "2026-01-01",
    personalAllowance: "60000.00",
    spouseAllowance: "0.00",
    recordedByEmployerAt: new Date(),
  });
  return employee;
}

async function seedPayrollPayRunFixture() {
  const employee = await seedPayrollEmployeeFixture();
  const headOffice = await ensurePayrollHeadOffice();
  const [payRun] = await db
    .insert(schema.payRuns)
    .values({
      orgId: E2E_ORG_ID,
      establishmentId: headOffice.id,
      periodStart: "2026-05-01",
      periodEnd: "2026-05-31",
      payDate: "2026-05-31",
      notes: "E2E payroll detail",
    })
    .returning();
  await db.insert(schema.paySlips).values({
    orgId: E2E_ORG_ID,
    establishmentId: headOffice.id,
    payRunId: payRun.id,
    employeeId: employee.id,
    grossSalary: "42000.00",
    pitWht: "1000.00",
    ssoEmployee: "750.00",
    ssoEmployer: "750.00",
    netPay: "40250.00",
  });
  return { employee, payRun };
}

async function seedPayrollFilingFixture() {
  const headOffice = await ensurePayrollHeadOffice();
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const [pnd1] = await db
    .insert(schema.pndFilings)
    .values({
      orgId: E2E_ORG_ID,
      establishmentId: headOffice.id,
      formType: "PND1",
      taxPeriod: "2026-05",
      filingStatus: "draft",
      totalPayees: 1,
      totalGrossAmount: "42000.00",
      totalWhtAmount: "1000.00",
      rdReferenceNumber: `RD-${suffix}`,
    })
    .returning();
  const [pnd1Kor] = await db
    .insert(schema.pndFilings)
    .values({
      orgId: E2E_ORG_ID,
      establishmentId: headOffice.id,
      formType: "PND1KOR",
      taxPeriod: "2026",
      filingStatus: "draft",
      totalPayees: 1,
      totalGrossAmount: "504000.00",
      totalWhtAmount: "12000.00",
      rdReferenceNumber: `RDKOR-${suffix}`,
    })
    .returning();
  const [sso] = await db
    .insert(schema.ssoFilings)
    .values({
      orgId: E2E_ORG_ID,
      establishmentId: headOffice.id,
      taxMonth: "2026-05",
      filingStatus: "draft",
      totalEmployees: 1,
      totalEmployeeContribution: "750.00",
      totalEmployerContribution: "750.00",
      ssoReferenceNumber: `SSO-${suffix}`,
    })
    .returning();

  return { pnd1, pnd1Kor, sso };
}

test.describe("Payroll Control Tower", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/payroll");
    await expect(page.locator("main")).toBeVisible();
  });

  test("renders employee intake and payroll cards", async ({ page }) => {
    await expect(
      page.getByRole("heading", { name: /Payroll Control Tower/i }),
    ).toBeVisible();
    await expect(page.getByText("Payroll is workflow-testable v1.")).toBeVisible();
    await expect(page.getByText(/Production filing still needs current SSO config validation/i)).toBeVisible();
    await expect(page.getByText("Active Employees")).toBeVisible();
    await expect(page.getByText("Draft Pay Runs", { exact: true })).toBeVisible();
    await expect(page.getByText("Create Draft Pay Run")).toBeVisible();
    await expect(page.getByText("Build PND.1 Draft")).toBeVisible();
    await expect(page.getByText("Build PND.1 Kor Draft")).toBeVisible();
    await expect(page.getByText("Build SSO Draft")).toBeVisible();
    await expect(page.getByText("Recent Pay Runs")).toBeVisible();
    await expect(page.getByText("PND Filings", { exact: true })).toBeVisible();
    await expect(page.getByText("SSO Filings", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: /Create Employee/i })).toBeVisible();
    await expect(page.getByRole("button", { name: "PND.1", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "SSO", exact: true })).toBeVisible();
  });

  test("has route in primary navigation", async ({ page }) => {
    await expect(page.getByRole("link", { name: /Payroll Control/i }).first()).toBeVisible();
  });

  test("opens employee allowance management", async ({ page }) => {
    const employee = await seedPayrollEmployeeFixture();
    const employeeName = employee.fullNameEn ?? "E2E Payroll Employee";

    await page.goto("/payroll/employees");
    await expect(page.getByRole("heading", { name: /Payroll Employees/i })).toBeVisible();
    await expect(
      page.locator(`a[href="/payroll/employees/${employee.id}/allowances"]`, {
        hasText: employeeName,
      })
    ).toBeVisible();
    await expect(page.getByText("42,000.00").first()).toBeVisible();

    await page.goto(`/payroll/employees/${employee.id}/allowances`);
    await expect(page.getByRole("heading", { name: employeeName })).toBeVisible();
    await expect(page.getByText("Add Allowance Declaration")).toBeVisible();
    await expect(page.getByText("Allowance History", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: /Save Allowance/i })).toBeVisible();
  });

  test("opens pay-run detail with employee slip preview", async ({ page }) => {
    const { employee, payRun } = await seedPayrollPayRunFixture();
    const employeeName = employee.fullNameEn ?? "E2E Payroll Employee";

    await page.goto("/payroll");
    await page.locator(`a[href="/payroll/runs/${payRun.id}"]`).click();
    await expect(page).toHaveURL(new RegExp(`/payroll/runs/${payRun.id}`));
    await expect(page.getByRole("heading", { name: /Pay Run 2026-05-31/i })).toBeVisible();
    await expect(page.getByText("Employee Slip Preview", { exact: true })).toBeVisible();
    await expect(page.getByText(employeeName)).toBeVisible();
    await expect(page.getByRole("cell", { name: "40,250.00" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Approve Pay Run/i })).toBeVisible();
  });

  test("opens payroll filing list pages", async ({ page }) => {
    const { pnd1, pnd1Kor, sso } = await seedPayrollFilingFixture();

    await page.goto("/payroll/filings/pnd1");
    await expect(page.getByRole("heading", { name: "PND.1 Filings" })).toBeVisible();
    await expect(page.getByText(pnd1.rdReferenceNumber ?? "")).toBeVisible();
    await expect(page.getByRole("cell", { name: "1,000.00" }).first()).toBeVisible();
    const pnd1SubmitRef = `RD-SUB-${Date.now()}`;
    const pnd1Row = page.getByRole("row").filter({ hasText: pnd1.rdReferenceNumber ?? "" });
    await pnd1Row.getByLabel("RD reference 2026-05").fill(pnd1SubmitRef);
    await pnd1Row.getByRole("button", { name: "Submit" }).click();
    await expect(page.getByText("PND.1 filing submitted")).toBeVisible();
    await expect
      .poll(async () => {
        const [row] = await db
          .select({ status: schema.pndFilings.filingStatus })
          .from(schema.pndFilings)
          .where(sql`${schema.pndFilings.id} = ${pnd1.id}`);
        return row?.status;
      })
      .toBe("submitted");
    const pnd1AcceptedRow = page.getByRole("row").filter({ hasText: pnd1SubmitRef });
    await pnd1AcceptedRow.getByRole("button", { name: "Accept" }).click();
    await expect(page.getByText("PND.1 filing accepted")).toBeVisible();
    await expect
      .poll(async () => {
        const [row] = await db
          .select({ status: schema.pndFilings.filingStatus })
          .from(schema.pndFilings)
          .where(sql`${schema.pndFilings.id} = ${pnd1.id}`);
        return row?.status;
      })
      .toBe("accepted");
    await expect(
      page
        .getByRole("row")
        .filter({ hasText: pnd1SubmitRef })
        .getByLabel("PND.1 remittance date 2026-05")
    ).toBeVisible();

    await page.goto("/payroll/filings/pnd1-kor");
    await expect(page.getByRole("heading", { name: "PND.1 Kor Filings" })).toBeVisible();
    await expect(page.getByText(pnd1Kor.rdReferenceNumber ?? "")).toBeVisible();
    await expect(page.getByRole("cell", { name: "12,000.00" }).first()).toBeVisible();
    const pnd1KorSubmitRef = `RDKOR-SUB-${Date.now()}`;
    const pnd1KorRow = page
      .getByRole("row")
      .filter({ hasText: pnd1Kor.rdReferenceNumber ?? "" });
    await pnd1KorRow.getByLabel("RD reference 2026").fill(pnd1KorSubmitRef);
    await pnd1KorRow.getByRole("button", { name: "Submit" }).click();
    await expect(page.getByText("PND.1 Kor filing submitted")).toBeVisible();
    await expect
      .poll(async () => {
        const [row] = await db
          .select({ status: schema.pndFilings.filingStatus })
          .from(schema.pndFilings)
          .where(sql`${schema.pndFilings.id} = ${pnd1Kor.id}`);
        return row?.status;
      })
      .toBe("submitted");
    const pnd1KorAcceptedRow = page.getByRole("row").filter({ hasText: pnd1KorSubmitRef });
    await pnd1KorAcceptedRow.getByRole("button", { name: "Accept" }).click();
    await expect(page.getByText("PND.1 Kor filing accepted")).toBeVisible();
    await expect
      .poll(async () => {
        const [row] = await db
          .select({ status: schema.pndFilings.filingStatus })
          .from(schema.pndFilings)
          .where(sql`${schema.pndFilings.id} = ${pnd1Kor.id}`);
        return row?.status;
      })
      .toBe("accepted");

    await page.goto("/payroll/filings/sso");
    await expect(page.getByRole("heading", { name: "SSO Filings" })).toBeVisible();
    await expect(page.getByText("SSO Rate Check")).toBeVisible();
    await expect(page.getByText(/SSO contribution configuration/)).toBeVisible();
    await expect(page.getByText(sso.ssoReferenceNumber ?? "")).toBeVisible();
    await expect(page.getByRole("cell", { name: "750.00" }).first()).toBeVisible();
    const ssoSubmitRef = `SSO-SUB-${Date.now()}`;
    const ssoRow = page.getByRole("row").filter({ hasText: sso.ssoReferenceNumber ?? "" });
    await ssoRow.getByLabel("SSO reference 2026-05").fill(ssoSubmitRef);
    await ssoRow.getByRole("button", { name: "Submit" }).click();
    await expect(page.getByText("SSO filing submitted")).toBeVisible();
    await expect
      .poll(async () => {
        const [row] = await db
          .select({ status: schema.ssoFilings.filingStatus })
          .from(schema.ssoFilings)
          .where(sql`${schema.ssoFilings.id} = ${sso.id}`);
        return row?.status;
      })
      .toBe("submitted");
    const ssoAcceptedRow = page.getByRole("row").filter({ hasText: ssoSubmitRef });
    await ssoAcceptedRow.getByRole("button", { name: "Accept" }).click();
    await expect(page.getByText("SSO filing accepted")).toBeVisible();
    await expect
      .poll(async () => {
        const [row] = await db
          .select({ status: schema.ssoFilings.filingStatus })
          .from(schema.ssoFilings)
          .where(sql`${schema.ssoFilings.id} = ${sso.id}`);
        return row?.status;
      })
      .toBe("accepted");
    await expect(
      page
        .getByRole("row")
        .filter({ hasText: ssoSubmitRef })
        .getByLabel("SSO remittance date 2026-05")
    ).toBeVisible();
  });
});
