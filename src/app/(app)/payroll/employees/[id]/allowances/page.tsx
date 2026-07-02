import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, UsersRound } from "lucide-react";
import { getPayrollEmployeeDetail } from "@/lib/db/queries/payroll";
import { getCurrentUserId } from "@/lib/utils/auth";
import { getVerifiedOrgId } from "@/lib/utils/org-context";
import { Amount } from "@/components/ui/amount";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { createEmployeeAllowanceAction } from "../../../actions";

type PayrollEmployeeAllowancesPageProps = {
  params: Promise<{ id: string }>;
};

async function submitAllowance(formData: FormData) {
  "use server";
  await createEmployeeAllowanceAction(formData);
}

function allowanceTotal(row: {
  personalAllowance: string;
  spouseAllowance: string;
  childCountPre2018: number;
  childCountPost2018SecondPlus: number;
  parentAllowance: string;
  disabledDependentAllowance: string;
  healthInsurancePremium: string;
  lifeInsurancePremium: string;
  parentsHealthInsurance: string;
  pensionInsurance: string;
  ltfRmfSsfAmount: string;
  mortgageInterest: string;
}) {
  return (
    Number(row.personalAllowance) +
    Number(row.spouseAllowance) +
    row.childCountPre2018 * 30000 +
    row.childCountPost2018SecondPlus * 60000 +
    Number(row.parentAllowance) +
    Number(row.disabledDependentAllowance) +
    Number(row.healthInsurancePremium) +
    Number(row.lifeInsurancePremium) +
    Number(row.parentsHealthInsurance) +
    Number(row.pensionInsurance) +
    Number(row.ltfRmfSsfAmount) +
    Number(row.mortgageInterest)
  ).toFixed(2);
}

export default async function PayrollEmployeeAllowancesPage({
  params,
}: PayrollEmployeeAllowancesPageProps) {
  const { id } = await params;
  const [orgId, actorId] = await Promise.all([
    getVerifiedOrgId(),
    getCurrentUserId(),
  ]);
  const detail = orgId
    ? await getPayrollEmployeeDetail(orgId, id, { actorId })
    : null;

  if (orgId && !detail) {
    notFound();
  }

  const displayName =
    detail?.employee.fullNameEn ??
    detail?.employee.fullNameTh ??
    "Payroll employee";
  const currentYear = new Date().getFullYear();

  return (
    <div className="space-y-6">
      <PageHeader
        title={displayName}
        description="Lor.Yor.01 allowance history, payroll class, and recent pay slips."
      >
        <Button variant="outline" render={<Link href="/payroll/employees" />}>
          <ArrowLeft className="mr-2 size-4" />
          Employees
        </Button>
      </PageHeader>

      {!orgId || !detail ? (
        <Card>
          <CardContent>
            <EmptyState
              icon={<UsersRound />}
              title="Select an organization to view employee allowances."
            />
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-4">
            <StatCard
              label="Branch"
              value={detail.employee.branchNumber}
              hint={detail.employee.establishmentName || "Payroll establishment"}
            />
            <StatCard
              label="PND.1 Type"
              value={detail.employee.isDirector ? "40(2)" : "40(1)"}
              hint={detail.employee.position ?? "No position"}
            />
            <StatCard
              label="Base Salary"
              value={<Amount value={detail.employee.baseMonthlySalary} />}
              hint={`Effective ${detail.employee.salaryEffectiveFrom ?? detail.employee.startDate}`}
            />
            <StatCard
              label="Status"
              value={detail.employee.endDate ? "Ended" : "Active"}
              hint={`Started ${detail.employee.startDate}`}
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Add Allowance Declaration</CardTitle>
            </CardHeader>
            <CardContent>
              <form action={submitAllowance} className="grid gap-4 md:grid-cols-4">
                <input type="hidden" name="employeeId" value={detail.employee.id} />
                <div className="space-y-2">
                  <Label htmlFor="taxYear">Tax year</Label>
                  <Input
                    id="taxYear"
                    name="taxYear"
                    type="number"
                    defaultValue={currentYear}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="effectiveFromMonth">Effective from</Label>
                  <Input
                    id="effectiveFromMonth"
                    name="effectiveFromMonth"
                    type="date"
                    defaultValue={`${currentYear}-01-01`}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="personalAllowance">Personal allowance</Label>
                  <Input
                    id="personalAllowance"
                    name="personalAllowance"
                    inputMode="decimal"
                    defaultValue="60000.00"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="spouseAllowance">Spouse allowance</Label>
                  <Input id="spouseAllowance" name="spouseAllowance" inputMode="decimal" defaultValue="0.00" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="childCountPre2018">Children 30k</Label>
                  <Input id="childCountPre2018" name="childCountPre2018" inputMode="numeric" defaultValue="0" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="childCountPost2018SecondPlus">Children 60k</Label>
                  <Input id="childCountPost2018SecondPlus" name="childCountPost2018SecondPlus" inputMode="numeric" defaultValue="0" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="parentAllowance">Parent allowance</Label>
                  <Input id="parentAllowance" name="parentAllowance" inputMode="decimal" defaultValue="0.00" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="disabledDependentAllowance">Disabled dependent</Label>
                  <Input id="disabledDependentAllowance" name="disabledDependentAllowance" inputMode="decimal" defaultValue="0.00" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="healthInsurancePremium">Health insurance</Label>
                  <Input id="healthInsurancePremium" name="healthInsurancePremium" inputMode="decimal" defaultValue="0.00" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lifeInsurancePremium">Life insurance</Label>
                  <Input id="lifeInsurancePremium" name="lifeInsurancePremium" inputMode="decimal" defaultValue="0.00" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="parentsHealthInsurance">Parents health insurance</Label>
                  <Input id="parentsHealthInsurance" name="parentsHealthInsurance" inputMode="decimal" defaultValue="0.00" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pensionInsurance">Pension insurance</Label>
                  <Input id="pensionInsurance" name="pensionInsurance" inputMode="decimal" defaultValue="0.00" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="providentFundContributionPct">Provident fund pct</Label>
                  <Input id="providentFundContributionPct" name="providentFundContributionPct" inputMode="decimal" defaultValue="0.0000" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ltfRmfSsfAmount">LTF/RMF/SSF</Label>
                  <Input id="ltfRmfSsfAmount" name="ltfRmfSsfAmount" inputMode="decimal" defaultValue="0.00" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="mortgageInterest">Mortgage interest</Label>
                  <Input id="mortgageInterest" name="mortgageInterest" inputMode="decimal" defaultValue="0.00" />
                </div>
                <div className="self-end">
                  <Button type="submit">Save Allowance</Button>
                </div>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Allowance History</CardTitle>
            </CardHeader>
            <CardContent>
              {detail.allowances.length === 0 ? (
                <EmptyState
                  size="sm"
                  title="No allowance declarations recorded."
                />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tax year</TableHead>
                      <TableHead>Effective from</TableHead>
                      <TableHead className="text-right">Personal</TableHead>
                      <TableHead className="text-right">Spouse</TableHead>
                      <TableHead className="text-right">Children</TableHead>
                      <TableHead className="text-right">Other</TableHead>
                      <TableHead className="text-right">Total tracked</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detail.allowances.map((allowance) => (
                      <TableRow key={allowance.id}>
                        <TableCell>{allowance.taxYear}</TableCell>
                        <TableCell>{allowance.effectiveFromMonth}</TableCell>
                        <TableCell className="text-right">
                          <Amount value={allowance.personalAllowance} />
                        </TableCell>
                        <TableCell className="text-right">
                          <Amount value={allowance.spouseAllowance} />
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {allowance.childCountPre2018} / {allowance.childCountPost2018SecondPlus}
                        </TableCell>
                        <TableCell className="text-right">
                          <Amount
                            value={(
                              Number(allowance.parentAllowance) +
                              Number(allowance.disabledDependentAllowance) +
                              Number(allowance.healthInsurancePremium) +
                              Number(allowance.lifeInsurancePremium) +
                              Number(allowance.parentsHealthInsurance) +
                              Number(allowance.pensionInsurance) +
                              Number(allowance.ltfRmfSsfAmount) +
                              Number(allowance.mortgageInterest)
                            ).toFixed(2)}
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          <Amount value={allowanceTotal(allowance)} />
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
              <CardTitle>Recent Pay Slips</CardTitle>
            </CardHeader>
            <CardContent>
              {detail.recentSlips.length === 0 ? (
                <EmptyState
                  size="sm"
                  title="No pay slips recorded for this employee."
                />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Pay date</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead className="text-right">Gross</TableHead>
                      <TableHead className="text-right">PIT</TableHead>
                      <TableHead className="text-right">SSO</TableHead>
                      <TableHead className="text-right">Net</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detail.recentSlips.map((slip) => (
                      <TableRow key={slip.id}>
                        <TableCell>{slip.payDate}</TableCell>
                        <TableCell>
                          <StatusBadge status={slip.status} />
                        </TableCell>
                        <TableCell>{slip.pnd1IncomeType}</TableCell>
                        <TableCell className="text-right">
                          <Amount value={slip.grossSalary} />
                        </TableCell>
                        <TableCell className="text-right">
                          <Amount value={slip.pitWht} />
                        </TableCell>
                        <TableCell className="text-right">
                          <Amount
                            value={(
                              Number(slip.ssoEmployee) + Number(slip.ssoEmployer)
                            ).toFixed(2)}
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          <Amount value={slip.netPay} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
