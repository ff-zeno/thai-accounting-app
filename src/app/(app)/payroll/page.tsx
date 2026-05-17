import Link from "next/link";
import { AlertTriangle, UsersRound } from "lucide-react";
import { getVerifiedOrgId } from "@/lib/utils/org-context";
import { getPayrollDashboard } from "@/lib/db/queries/payroll";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  approvePayRunAction,
  buildPnd1DraftAction,
  buildPnd1KorDraftAction,
  buildSsoFilingDraftAction,
  createDraftPayRunAction,
  createEmployeeAction,
  recordPayRunPaymentAction,
  recordPnd1RemittanceAction,
  recordSsoRemittanceAction,
} from "./actions";

async function submitEmployee(formData: FormData) {
  "use server";
  await createEmployeeAction(formData);
}

async function submitPayRun(formData: FormData) {
  "use server";
  await createDraftPayRunAction(formData);
}

async function submitPnd1Draft(formData: FormData) {
  "use server";
  await buildPnd1DraftAction(formData);
}

async function submitPnd1KorDraft(formData: FormData) {
  "use server";
  await buildPnd1KorDraftAction(formData);
}

async function submitSsoDraft(formData: FormData) {
  "use server";
  await buildSsoFilingDraftAction(formData);
}

async function submitApprovePayRun(formData: FormData) {
  "use server";
  await approvePayRunAction(formData);
}

async function submitPayRunPayment(formData: FormData) {
  "use server";
  await recordPayRunPaymentAction(formData);
}

async function submitPnd1Remittance(formData: FormData) {
  "use server";
  await recordPnd1RemittanceAction(formData);
}

async function submitSsoRemittance(formData: FormData) {
  "use server";
  await recordSsoRemittanceAction(formData);
}

function amount(value: string | null | undefined) {
  return Number(value ?? 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export default async function PayrollPage() {
  const orgId = await getVerifiedOrgId();
  const dashboard = orgId ? await getPayrollDashboard(orgId) : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Payroll Control Tower
          </h1>
          <p className="text-sm text-muted-foreground">
            Employees, allowance declarations, pay-run readiness, PND.1, and SSO filing surface.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" render={<Link href="/payroll/employees" />}>
            Employees
          </Button>
          <Button variant="outline" render={<Link href="/payroll/filings/pnd1" />}>
            PND.1
          </Button>
          <Button variant="outline" render={<Link href="/payroll/filings/sso" />}>
            SSO
          </Button>
        </div>
      </div>

      {!orgId || !dashboard ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-2 py-12 text-center">
            <UsersRound className="size-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Select an organization to view payroll controls.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card className="border-amber-200 bg-amber-50 text-amber-950">
            <CardContent className="flex gap-3 py-4 text-sm">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <div>
                <p className="font-medium">Payroll is workflow-testable v1.</p>
                <p className="mt-1 text-amber-900">
                  Employee setup, allowances, draft pay runs, PIT/SSO calculation, filing lists,
                  submit/accept status, remittance posting, and sensitive-read audit are testable.
                  Production filing still needs current SSO config validation, exact RD/SSO
                  exports, employee 50 Tawi, receipt attachment, reconciliation hooks, and bank
                  matching.
                </p>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Active Employees</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold">
                  {dashboard.employeeSummary.activeEmployeeCount}
                </div>
                <p className="text-xs text-muted-foreground">
                  {dashboard.employeeSummary.directorCount} director-classified.
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Draft Pay Runs</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold">
                  {dashboard.payRunSummary.draftPayRunCount}
                </div>
                <p className="text-xs text-muted-foreground">
                  {dashboard.payRunSummary.approvedPayRunCount} approved.
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">PIT Withheld</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold">
                  {amount(dashboard.slipSummary.pitWht)}
                </div>
                <p className="text-xs text-muted-foreground">
                  From draft/posted pay slips.
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">SSO Employer</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold">
                  {amount(dashboard.slipSummary.ssoEmployer)}
                </div>
                <p className="text-xs text-muted-foreground">
                  Employer-side contribution total.
                </p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Create Employee</CardTitle>
            </CardHeader>
            <CardContent>
              <form action={submitEmployee} className="grid gap-4 md:grid-cols-4">
                <div className="space-y-2">
                  <Label htmlFor="fullNameEn">Name EN</Label>
                  <Input id="fullNameEn" name="fullNameEn" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="fullNameTh">Name TH</Label>
                  <Input id="fullNameTh" name="fullNameTh" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="taxId">Tax ID</Label>
                  <Input id="taxId" name="taxId" maxLength={13} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="passportNumber">Passport</Label>
                  <Input id="passportNumber" name="passportNumber" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="position">Position</Label>
                  <Input id="position" name="position" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="startDate">Start date</Label>
                  <Input id="startDate" name="startDate" type="date" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="baseMonthlySalary">Base monthly salary</Label>
                  <Input id="baseMonthlySalary" name="baseMonthlySalary" inputMode="decimal" defaultValue="0.00" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="salaryEffectiveFrom">Salary effective</Label>
                  <Input id="salaryEffectiveFrom" name="salaryEffectiveFrom" type="date" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="payFrequency">Pay frequency</Label>
                  <select
                    id="payFrequency"
                    name="payFrequency"
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                    defaultValue="monthly"
                  >
                    <option value="monthly">Monthly</option>
                    <option value="bi_weekly">Bi-weekly</option>
                    <option value="weekly">Weekly</option>
                    <option value="daily">Daily</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="payPeriodsPerYear">Periods/year</Label>
                  <Input id="payPeriodsPerYear" name="payPeriodsPerYear" inputMode="numeric" defaultValue="12" />
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="isDirector" />
                  Director / §40(2)
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="socialSecurityEligible" defaultChecked />
                  SSO eligible
                </label>
                <div className="md:col-span-4">
                  <Button type="submit">Create Employee</Button>
                </div>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Create Draft Pay Run</CardTitle>
            </CardHeader>
            <CardContent>
              <form action={submitPayRun} className="grid gap-4 md:grid-cols-5">
                <div className="space-y-2">
                  <Label htmlFor="periodStart">Period start</Label>
                  <Input id="periodStart" name="periodStart" type="date" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="periodEnd">Period end</Label>
                  <Input id="periodEnd" name="periodEnd" type="date" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="payDate">Pay date</Label>
                  <Input id="payDate" name="payDate" type="date" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="defaultGrossSalary">Gross override</Label>
                  <Input id="defaultGrossSalary" name="defaultGrossSalary" inputMode="decimal" defaultValue="0.00" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="payRunNotes">Notes</Label>
                  <Input id="payRunNotes" name="notes" />
                </div>
                <div className="md:col-span-5">
                  <Button
                    type="submit"
                    disabled={dashboard.employeeSummary.activeEmployeeCount === 0}
                  >
                    Generate Draft Pay Run
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle>Build PND.1 Draft</CardTitle>
              </CardHeader>
              <CardContent>
                <form action={submitPnd1Draft} className="grid gap-4 sm:grid-cols-[1fr_auto]">
                  <div className="space-y-2">
                    <Label htmlFor="pnd1TaxMonth">Tax month</Label>
                    <Input id="pnd1TaxMonth" name="taxMonth" type="month" required />
                  </div>
                  <div className="self-end">
                    <Button type="submit">Build PND.1</Button>
                  </div>
                </form>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Build PND.1 Kor Draft</CardTitle>
              </CardHeader>
              <CardContent>
                <form action={submitPnd1KorDraft} className="grid gap-4 sm:grid-cols-[1fr_auto]">
                  <div className="space-y-2">
                    <Label htmlFor="pnd1KorTaxYear">Tax year</Label>
                    <Input
                      id="pnd1KorTaxYear"
                      name="taxYear"
                      type="number"
                      min="2000"
                      max="2200"
                      required
                    />
                  </div>
                  <div className="self-end">
                    <Button type="submit">Build PND.1 Kor</Button>
                  </div>
                </form>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Build SSO Draft</CardTitle>
              </CardHeader>
              <CardContent>
                <form action={submitSsoDraft} className="grid gap-4 sm:grid-cols-[1fr_auto]">
                  <div className="space-y-2">
                    <Label htmlFor="ssoTaxMonth">Tax month</Label>
                    <Input id="ssoTaxMonth" name="taxMonth" type="month" required />
                  </div>
                  <div className="self-end">
                    <Button type="submit">Build SSO</Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Employees</CardTitle>
            </CardHeader>
            <CardContent>
              {dashboard.recentEmployees.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  No employees recorded yet.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Branch</TableHead>
                      <TableHead>Position</TableHead>
                      <TableHead>Start</TableHead>
                      <TableHead className="text-right">Base salary</TableHead>
                      <TableHead>Frequency</TableHead>
                      <TableHead>Flags</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dashboard.recentEmployees.map((employee) => (
                      <TableRow key={employee.id}>
                        <TableCell className="font-medium">
                          <Link
                            className="underline-offset-4 hover:underline"
                            href={`/payroll/employees/${employee.id}/allowances`}
                          >
                            {employee.fullNameEn ?? employee.fullNameTh}
                          </Link>
                        </TableCell>
                        <TableCell>{employee.branchNumber}</TableCell>
                        <TableCell>{employee.position ?? "-"}</TableCell>
                        <TableCell>{employee.startDate}</TableCell>
                        <TableCell className="text-right font-mono">
                          {amount(employee.baseMonthlySalary)}
                        </TableCell>
                        <TableCell>{employee.payFrequency}</TableCell>
                        <TableCell>
                          {employee.isDirector ? "40(2)" : "40(1)"}
                          {employee.socialSecurityEligible ? " / SSO" : ""}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recent Pay Runs</CardTitle>
            </CardHeader>
            <CardContent>
              {dashboard.recentPayRuns.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  No pay runs generated yet.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Pay date</TableHead>
                      <TableHead>Period</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Slips</TableHead>
                      <TableHead className="text-right">Gross</TableHead>
                      <TableHead className="text-right">PIT</TableHead>
                      <TableHead className="text-right">Net</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dashboard.recentPayRuns.map((payRun) => (
                      <TableRow key={payRun.id}>
                        <TableCell>
                          <Link
                            href={`/payroll/runs/${payRun.id}`}
                            className="font-medium text-primary underline-offset-4 hover:underline"
                          >
                            {payRun.payDate}
                          </Link>
                        </TableCell>
                        <TableCell>
                          {payRun.periodStart} - {payRun.periodEnd}
                        </TableCell>
                        <TableCell>{payRun.status}</TableCell>
                        <TableCell className="text-right font-mono">{payRun.slipCount}</TableCell>
                        <TableCell className="text-right font-mono">
                          {amount(payRun.grossSalary)}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {amount(payRun.pitWht)}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {amount(payRun.netPay)}
                        </TableCell>
                        <TableCell className="text-right">
                          {payRun.status === "draft" ? (
                            <form action={submitApprovePayRun}>
                              <input type="hidden" name="payRunId" value={payRun.id} />
                              <Button type="submit" size="sm" variant="outline">
                                Approve
                              </Button>
                            </form>
                          ) : payRun.status === "approved" ? (
                            <form action={submitPayRunPayment} className="flex justify-end gap-2">
                              <input type="hidden" name="payRunId" value={payRun.id} />
                              <Input
                                aria-label="Payroll payment date"
                                className="h-8 w-36"
                                name="paymentDate"
                                type="date"
                                defaultValue={payRun.payDate}
                                required
                              />
                              <Button type="submit" size="sm" variant="outline">
                                Pay
                              </Button>
                            </form>
                          ) : null}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>
                  <Link className="underline-offset-4 hover:underline" href="/payroll/filings/pnd1">
                    PND Filings
                  </Link>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {dashboard.recentPndFilings.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    No PND filings drafted yet.
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Form</TableHead>
                        <TableHead>Period</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Payees</TableHead>
                        <TableHead className="text-right">WHT</TableHead>
                        <TableHead className="text-right">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {dashboard.recentPndFilings.map((filing) => (
                        <TableRow key={filing.id}>
                          <TableCell>{filing.formType}</TableCell>
                          <TableCell>{filing.taxPeriod}</TableCell>
                          <TableCell>{filing.filingStatus}</TableCell>
                          <TableCell className="text-right font-mono">
                            {filing.totalPayees ?? 0}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {amount(filing.totalWhtAmount)}
                          </TableCell>
                          <TableCell className="text-right">
                            {filing.formType === "PND1" && !filing.paidAt ? (
                              <form action={submitPnd1Remittance} className="flex justify-end gap-2">
                                <input type="hidden" name="filingId" value={filing.id} />
                                <Input
                                  aria-label="PND.1 remittance date"
                                  className="h-8 w-36"
                                  name="paymentDate"
                                  type="date"
                                  defaultValue={`${filing.taxPeriod}-15`}
                                  required
                                />
                                <Button type="submit" size="sm" variant="outline">
                                  Pay
                                </Button>
                              </form>
                            ) : filing.paidAt ? (
                              "Paid"
                            ) : null}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>
                  <Link className="underline-offset-4 hover:underline" href="/payroll/filings/sso">
                    SSO Filings
                  </Link>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {dashboard.recentSsoFilings.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    No SSO filings drafted yet.
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Month</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Employees</TableHead>
                        <TableHead className="text-right">Employee</TableHead>
                        <TableHead className="text-right">Employer</TableHead>
                        <TableHead className="text-right">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {dashboard.recentSsoFilings.map((filing) => (
                        <TableRow key={filing.id}>
                          <TableCell>{filing.taxMonth}</TableCell>
                          <TableCell>{filing.filingStatus}</TableCell>
                          <TableCell className="text-right font-mono">
                            {filing.totalEmployees ?? 0}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {amount(filing.totalEmployeeContribution)}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {amount(filing.totalEmployerContribution)}
                          </TableCell>
                          <TableCell className="text-right">
                            {filing.paidAt ? (
                              "Paid"
                            ) : (
                            <form action={submitSsoRemittance} className="flex justify-end gap-2">
                              <input type="hidden" name="filingId" value={filing.id} />
                              <Input
                                aria-label="SSO remittance date"
                                className="h-8 w-36"
                                name="paymentDate"
                                type="date"
                                defaultValue={`${filing.taxMonth}-15`}
                                required
                              />
                              <Button type="submit" size="sm" variant="outline">
                                Pay
                              </Button>
                            </form>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
