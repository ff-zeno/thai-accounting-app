import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, ReceiptText } from "lucide-react";
import { getPayrollPayRunDetail } from "@/lib/db/queries/payroll";
import { getCurrentUserId } from "@/lib/utils/auth";
import { getVerifiedOrgId } from "@/lib/utils/org-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
  recordPayRunPaymentAction,
} from "../../actions";

type PayrollPayRunPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
};

async function submitApprovePayRun(formData: FormData) {
  "use server";
  const result = await approvePayRunAction(formData);
  if (result?.error) {
    const payRunId = String(formData.get("payRunId") ?? "");
    redirect(`/payroll/runs/${payRunId}?error=${encodeURIComponent(result.error)}`);
  }
}

async function submitPayRunPayment(formData: FormData) {
  "use server";
  const result = await recordPayRunPaymentAction(formData);
  if (result?.error) {
    const payRunId = String(formData.get("payRunId") ?? "");
    redirect(`/payroll/runs/${payRunId}?error=${encodeURIComponent(result.error)}`);
  }
}

function amount(value: string | null | undefined) {
  return Number(value ?? 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function employeeName(slip: {
  employeeNameEn: string | null;
  employeeNameTh: string | null;
  employeeId: string;
}) {
  return slip.employeeNameEn ?? slip.employeeNameTh ?? slip.employeeId.slice(0, 8);
}

function bangkokDate(value: Date | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);
}

function incomeTypeLabel(value: string) {
  const labels: Record<string, string> = {
    "40_1": "40(1)",
    "40_2": "40(2)",
  };
  return labels[value] ?? value;
}

export default async function PayrollPayRunPage({
  params,
  searchParams,
}: PayrollPayRunPageProps) {
  const { id } = await params;
  const { error } = await searchParams;
  const [orgId, actorId] = await Promise.all([
    getVerifiedOrgId(),
    getCurrentUserId(),
  ]);
  const detail = orgId
    ? await getPayrollPayRunDetail(orgId, id, { actorId })
    : null;

  if (orgId && !detail) {
    notFound();
  }

  const title = detail
    ? `Pay Run ${detail.payRun.payDate}`
    : "Pay Run";

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="text-sm text-muted-foreground">
            Per-employee slip preview, payroll tax summary, and approval/payment controls.
          </p>
        </div>
        <Button variant="outline" render={<Link href="/payroll" />}>
          <ArrowLeft className="mr-2 size-4" />
          Payroll
        </Button>
      </div>

      {!orgId || !detail ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-2 py-12 text-center">
            <ReceiptText className="size-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Select an organization to view payroll pay-run detail.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Gross Pay</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold">
                  {amount(detail.summary.grossSalary)}
                </div>
                <p className="text-xs text-muted-foreground">
                  {detail.summary.slipCount} employee slips.
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">PIT Withheld</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold">
                  {amount(detail.summary.pitWht)}
                </div>
                <p className="text-xs text-muted-foreground">PND.1 wage tax.</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">SSO</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold">
                  {amount(detail.summary.ssoEmployee)}
                </div>
                <p className="text-xs text-muted-foreground">
                  Employer {amount(detail.summary.ssoEmployer)}.
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Net Pay</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold">
                  {amount(detail.summary.netPay)}
                </div>
                <p className="text-xs text-muted-foreground">
                  Status {detail.payRun.status}.
                </p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Pay Run Profile</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 text-sm md:grid-cols-4">
              <div>
                <p className="text-muted-foreground">Period</p>
                <p className="font-medium">
                  {detail.payRun.periodStart} - {detail.payRun.periodEnd}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Pay date</p>
                <p className="font-medium">{detail.payRun.payDate}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Branch</p>
                <p className="font-medium">
                  {detail.payRun.branchNumber ?? "-"} {detail.payRun.establishmentName}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Approved</p>
                <p className="font-medium">
                  {bangkokDate(detail.payRun.approvedAt)}
                </p>
              </div>
              <div className="md:col-span-4">
                <p className="text-muted-foreground">Notes</p>
                <p className="font-medium">{detail.payRun.notes ?? "-"}</p>
              </div>
            </CardContent>
          </Card>

          {error ? (
            <Card>
              <CardContent className="py-4 text-sm text-destructive">
                {error}
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle>Controls</CardTitle>
            </CardHeader>
            <CardContent>
              {detail.payRun.status === "draft" ? (
                <form action={submitApprovePayRun}>
                  <input type="hidden" name="payRunId" value={detail.payRun.id} />
                  <Button type="submit" variant="outline">
                    Approve Pay Run
                  </Button>
                </form>
              ) : detail.payRun.status === "approved" ? (
                <form action={submitPayRunPayment} className="flex flex-wrap items-end gap-3">
                  <input type="hidden" name="payRunId" value={detail.payRun.id} />
                  <Input
                    aria-label="Payroll payment date"
                    className="w-40"
                    name="paymentDate"
                    type="date"
                    defaultValue={detail.payRun.payDate}
                    required
                  />
                  <Button type="submit" variant="outline">
                    Record Payment
                  </Button>
                </form>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No open pay-run action for this status.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Employee Slip Preview</CardTitle>
            </CardHeader>
            <CardContent>
              {detail.slips.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  No slips generated for this pay run.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Employee</TableHead>
                      <TableHead>Income</TableHead>
                      <TableHead className="text-right">Gross</TableHead>
                      <TableHead className="text-right">PIT</TableHead>
                      <TableHead className="text-right">SSO Emp.</TableHead>
                      <TableHead className="text-right">SSO Co.</TableHead>
                      <TableHead className="text-right">Other Ded.</TableHead>
                      <TableHead className="text-right">Net</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detail.slips.map((slip) => (
                      <TableRow key={slip.id}>
                        <TableCell>
                          <div className="font-medium">{employeeName(slip)}</div>
                          <div className="text-xs text-muted-foreground">
                            {slip.position ?? "-"}
                          </div>
                        </TableCell>
                        <TableCell>{incomeTypeLabel(slip.pnd1IncomeType)}</TableCell>
                        <TableCell className="text-right font-mono">
                          {amount(slip.grossSalary)}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {amount(slip.pitWht)}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {amount(slip.ssoEmployee)}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {amount(slip.ssoEmployer)}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {amount(slip.otherDeductions)}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {amount(slip.netPay)}
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
