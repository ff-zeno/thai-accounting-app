import Link from "next/link";
import { UsersRound } from "lucide-react";
import { getPayrollEmployees } from "@/lib/db/queries/payroll";
import { getVerifiedOrgId } from "@/lib/utils/org-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Payroll Employees
          </h1>
          <p className="text-sm text-muted-foreground">
            Employee roster, branch filing scope, salary class, and allowance readiness.
          </p>
        </div>
        <Button variant="outline" render={<Link href="/payroll" />}>
          Payroll
        </Button>
      </div>

      {!orgId ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-2 py-12 text-center">
            <UsersRound className="size-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Select an organization to view payroll employees.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Employees</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold">{employees.length}</div>
                <p className="text-xs text-muted-foreground">
                  {activeCount} active.
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Director Income</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold">
                  {employees.filter((employee) => employee.isDirector).length}
                </div>
                <p className="text-xs text-muted-foreground">
                  PND.1 income type 40(2).
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Allowance Records</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold">
                  {employees.reduce((sum, employee) => sum + employee.allowanceCount, 0)}
                </div>
                <p className="text-xs text-muted-foreground">
                  Lor.Yor.01 rows on file.
                </p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Employee Roster</CardTitle>
            </CardHeader>
            <CardContent>
              {employees.length === 0 ? (
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
                        <TableCell>{employee.endDate ? "Ended" : "Active"}</TableCell>
                        <TableCell className="text-right font-mono">
                          {Number(employee.baseMonthlySalary).toLocaleString("en-US", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </TableCell>
                        <TableCell>
                          {employee.payFrequency} / {employee.payPeriodsPerYear}
                        </TableCell>
                        <TableCell>{employee.isDirector ? "40(2)" : "40(1)"}</TableCell>
                        <TableCell className="text-right font-mono">
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
