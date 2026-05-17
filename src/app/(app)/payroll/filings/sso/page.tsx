import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, FileText } from "lucide-react";
import {
  markSsoFilingAcceptedAction,
  markSsoFilingSubmittedAction,
  recordSsoRemittanceAction,
} from "../../actions";
import { getActiveSsoConfig, getPayrollSsoFilings } from "@/lib/db/queries/payroll";
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

function amount(value: string | null | undefined) {
  return Number(value ?? 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function dateOnly(value: Date | null | undefined) {
  return value ? value.toISOString().slice(0, 10) : "-";
}

async function submitSsoFiling(formData: FormData) {
  "use server";
  const result = await markSsoFilingSubmittedAction(formData);
  if (result?.error) {
    redirect(`/payroll/filings/sso?error=${encodeURIComponent(result.error)}`);
  }
  redirect("/payroll/filings/sso?status=SSO filing submitted");
}

async function acceptSsoFiling(formData: FormData) {
  "use server";
  const result = await markSsoFilingAcceptedAction(formData);
  if (result?.error) {
    redirect(`/payroll/filings/sso?error=${encodeURIComponent(result.error)}`);
  }
  redirect("/payroll/filings/sso?status=SSO filing accepted");
}

async function paySsoFiling(formData: FormData) {
  "use server";
  const result = await recordSsoRemittanceAction(formData);
  if (result?.error) {
    redirect(`/payroll/filings/sso?error=${encodeURIComponent(result.error)}`);
  }
  redirect("/payroll/filings/sso?status=SSO remittance recorded");
}

export default async function PayrollSsoFilingsPage({
  searchParams,
}: {
  searchParams?: Promise<{ error?: string; status?: string }>;
}) {
  const orgId = await getVerifiedOrgId();
  const messages = searchParams ? await searchParams : {};
  const [filings, activeSsoConfig] = await Promise.all([
    orgId ? getPayrollSsoFilings(orgId) : [],
    getActiveSsoConfig(new Date().toISOString().slice(0, 10)),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">SSO Filings</h1>
          <p className="text-sm text-muted-foreground">
            Monthly Social Security drafts, employee/employer totals, and remittance state.
          </p>
        </div>
        <Button variant="outline" render={<Link href="/payroll" />}>
          <ArrowLeft className="mr-2 size-4" />
          Payroll
        </Button>
      </div>

      {messages.error ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {messages.error}
        </div>
      ) : null}
      {messages.status ? (
        <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700">
          {messages.status}
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>SSO Rate Check</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {activeSsoConfig ? (
            <>
              <div className="grid gap-3 md:grid-cols-4">
                <div>
                  <div className="text-xs text-muted-foreground">Employee rate</div>
                  <div className="font-mono">
                    {(Number(activeSsoConfig.employeeRate) * 100).toFixed(2)}%
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Employer rate</div>
                  <div className="font-mono">
                    {(Number(activeSsoConfig.employerRate) * 100).toFixed(2)}%
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Wage cap</div>
                  <div className="font-mono">
                    {amount(activeSsoConfig.insurableWageCap)}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Max / side</div>
                  <div className="font-mono">
                    {amount(activeSsoConfig.monthlyMaxPerSide)}
                  </div>
                </div>
              </div>
              <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-amber-800">
                Verify the current SSO contribution rate, wage floor/cap, and submission
                channel before filing. Source: {activeSsoConfig.sourceCitation}
              </div>
            </>
          ) : (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-destructive">
              No active SSO contribution configuration is available for today. Build pay
              runs and filings only after current SSO rates are configured.
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Monthly SSO</CardTitle>
        </CardHeader>
        <CardContent>
          {filings.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
              <FileText className="size-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                No SSO filings drafted yet.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Month</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Paid</TableHead>
                  <TableHead>SSO ref</TableHead>
                  <TableHead className="text-right">Employees</TableHead>
                  <TableHead className="text-right">Employee</TableHead>
                  <TableHead className="text-right">Employer</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filings.map((filing) => (
                  <TableRow key={filing.id}>
                    <TableCell className="font-medium">{filing.taxMonth}</TableCell>
                    <TableCell>{filing.filingStatus}</TableCell>
                    <TableCell>{dateOnly(filing.paidAt)}</TableCell>
                    <TableCell>{filing.ssoReferenceNumber ?? "-"}</TableCell>
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
                      {filing.filingStatus === "draft" ? (
                        <form action={submitSsoFiling} className="flex justify-end gap-2">
                          <input type="hidden" name="filingId" value={filing.id} />
                          <Input
                            aria-label={`SSO reference ${filing.taxMonth}`}
                            className="h-8 w-40"
                            name="ssoReferenceNumber"
                            placeholder="SSO reference"
                            required
                          />
                          <Button type="submit" size="sm" variant="outline">
                            Submit
                          </Button>
                        </form>
                      ) : filing.filingStatus === "submitted" ? (
                        <form action={acceptSsoFiling} className="flex justify-end gap-2">
                          <input type="hidden" name="filingId" value={filing.id} />
                          <Input
                            aria-label={`Accepted SSO reference ${filing.taxMonth}`}
                            className="h-8 w-40"
                            name="ssoReferenceNumber"
                            defaultValue={filing.ssoReferenceNumber ?? ""}
                          />
                          <Button type="submit" size="sm" variant="outline">
                            Accept
                          </Button>
                        </form>
                      ) : filing.filingStatus === "accepted" && !filing.paidAt ? (
                        <form action={paySsoFiling} className="flex justify-end gap-2">
                          <input type="hidden" name="filingId" value={filing.id} />
                          <Input
                            aria-label={`SSO remittance date ${filing.taxMonth}`}
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
                      ) : (
                        "-"
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
  );
}
