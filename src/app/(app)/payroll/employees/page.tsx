import Link from "next/link";
import { UsersRound } from "lucide-react";
import { getPayrollEmployees } from "@/lib/db/queries/payroll";
import { getVerifiedOrgId } from "@/lib/utils/org-context";
import { Amount } from "@/components/ui/amount";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default async function PayrollEmployeesPage() {
  const orgId = await getVerifiedOrgId();
  const employees = orgId ? await getPayrollEmployees(orgId) : [];
  const activeCount = employees.filter((employee) => !employee.endDate).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Payroll Employees"
        description="Employee roster, branch filing scope, salary class, and allowance readiness."
      >
        <Button variant="outline" render={<Link href="/payroll" />}>
          Payroll
        </Button>
      </PageHeader>

      {!orgId ? (
        <Card>
          <CardContent>
            <EmptyState
              icon={<UsersRound />}
              title="Select an organization to view payroll employees."
            />
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <StatCard
              label="Employees"
              value={employees.length}
              hint={`${activeCount} active.`}
            />
            <StatCard
              label="Director Income"
              value={employees.filter((employee) => employee.isDirector).length}
              hint="PND.1 income type 40(2)."
            />
            <StatCard
              label="Allowance Records"
              value={employees.reduce((sum, employee) => sum + employee.allowanceCount, 0)}
              hint="Lor.Yor.01 rows on file."
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Employee Roster</CardTitle>
            </CardHeader>
            <CardContent>
              {employees.length === 0 ? (
                <EmptyState size="sm" title="No employees recorded yet." />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Branch</TableHead>
                      <TableHead>Position</TableHead>
                      <TableHead>Start</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Base salary</TableHead>
                      <TableHead>Frequency</TableHead>
                      <TableHead>PND.1 type</TableHead>
                      <TableHead className="text-right">Allowances</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {employees.map((employee) => (
                      <TableRow key={employee.id}>
                        <TableCell className="font-medium">
                          <Link
                            className="underline-offset-4 hover:underline"
                            href={`/payroll/employees/${employee.id}/allowances`}
                          >
                            {employee.fullNameEn ?? employee.fullNameTh ?? "Unnamed employee"}
                          </Link>
                        </TableCell>
                        <TableCell>{employee.branchNumber}</TableCell>
                        <TableCell>{employee.position ?? "-"}</TableCell>
                        <TableCell>{employee.startDate}</TableCell>
                        <TableCell>
                          <StatusBadge
                            status={employee.endDate ? "ended" : "active"}
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          <Amount value={employee.baseMonthlySalary} />
                        </TableCell>
                        <TableCell>
                          {employee.payFrequency} / {employee.payPeriodsPerYear}
                        </TableCell>
                        <TableCell>{employee.isDirector ? "40(2)" : "40(1)"}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {employee.allowanceCount}
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
