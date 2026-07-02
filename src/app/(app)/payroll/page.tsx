import Link from "next/link";
import { AlertTriangle, UsersRound } from "lucide-react";
import { getVerifiedOrgId } from "@/lib/utils/org-context";
import { getPayrollDashboard } from "@/lib/db/queries/payroll";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Amount } from "@/components/ui/amount";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { StatusBadge } from "@/components/status-badge";
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

export default async function PayrollPage() {
  const orgId = await getVerifiedOrgId();
  const dashboard = orgId ? await getPayrollDashboard(orgId) : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Payroll Control Tower"
        description="Employees, allowance declarations, pay-run readiness, PND.1, and SSO filing surface."
      >
        <Button variant="outline" render={<Link href="/payroll/employees" />}>
          Employees
        </Button>
        <Button variant="outline" render={<Link href="/payroll/filings/pnd1" />}>
          PND.1
        </Button>
        <Button variant="outline" render={<Link href="/payroll/filings/sso" />}>
          SSO
        </Button>
      </PageHeader>

      {!orgId || !dashboard ? (
        <Card>
          <CardContent>
            <EmptyState
              icon={<UsersRound />}
              title="Select an organization to view payroll controls."
            />
          </CardContent>
        </Card>
      ) : (
        <>
          <Alert variant="warning">
            <AlertTriangle />
            <AlertTitle>Payroll is workflow-testable v1.</AlertTitle>
            <AlertDescription>
              Employee setup, allowances, draft pay runs, PIT/SSO calculation, filing lists,
              submit/accept status, remittance posting, and sensitive-read audit are testable.
              Production filing still needs current SSO config validation, exact RD/SSO
              exports, employee 50 Tawi, receipt attachment, reconciliation hooks, and bank
              matching.
            </AlertDescription>
          </Alert>

          <div className="grid gap-4 md:grid-cols-4">
            <StatCard
              label="Active Employees"
              value={dashboard.employeeSummary.activeEmployeeCount}
              hint={`${dashboard.employeeSummary.directorCount} director-classified.`}
            />
            <StatCard
              label="Draft Pay Runs"
              value={dashboard.payRunSummary.draftPayRunCount}
              hint={`${dashboard.payRunSummary.approvedPayRunCount} approved.`}
            />
            <StatCard
              label="PIT Withheld"
              value={<Amount value={dashboard.slipSummary.pitWht} />}
              hint="From draft/posted pay slips."
            />
            <StatCard
              label="SSO Employer"
              value={<Amount value={dashboard.slipSummary.ssoEmployer} />}
              hint="Employer-side contribution total."
            />
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
                  <NativeSelect
                    id="payFrequency"
                    name="payFrequency"
                    className="w-full"
                    defaultValue="monthly"
                  >
                    <option value="monthly">Monthly</option>
                    <option value="bi_weekly">Bi-weekly</option>
                    <option value="weekly">Weekly</option>
                    <option value="daily">Daily</option>
                  </NativeSelect>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="payPeriodsPerYear">Periods/year</Label>
                  <Input id="payPeriodsPerYear" name="payPeriodsPerYear" inputMode="numeric" defaultValue="12" />
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="isDirector" className="size-4 accent-primary" />
                  Director / §40(2)
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    name="socialSecurityEligible"
                    defaultChecked
                    className="size-4 accent-primary"
                  />
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
                <EmptyState size="sm" title="No employees recorded yet." />
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
                        <TableCell className="text-right">
                          <Amount value={employee.baseMonthlySalary} />
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
                <EmptyState size="sm" title="No pay runs generated yet." />
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
                        <TableCell>
                          <StatusBadge status={payRun.status} />
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{payRun.slipCount}</TableCell>
                        <TableCell className="text-right">
                          <Amount value={payRun.grossSalary} />
                        </TableCell>
                        <TableCell className="text-right">
                          <Amount value={payRun.pitWht} />
                        </TableCell>
                        <TableCell className="text-right">
                          <Amount value={payRun.netPay} />
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
                  <EmptyState size="sm" title="No PND filings drafted yet." />
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
                          <TableCell>
                            <StatusBadge status={filing.filingStatus} />
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {filing.totalPayees ?? 0}
                          </TableCell>
                          <TableCell className="text-right">
                            <Amount value={filing.totalWhtAmount} />
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
                  <EmptyState size="sm" title="No SSO filings drafted yet." />
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
                          <TableCell>
                            <StatusBadge status={filing.filingStatus} />
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {filing.totalEmployees ?? 0}
                          </TableCell>
                          <TableCell className="text-right">
                            <Amount value={filing.totalEmployeeContribution} />
                          </TableCell>
                          <TableCell className="text-right">
                            <Amount value={filing.totalEmployerContribution} />
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
