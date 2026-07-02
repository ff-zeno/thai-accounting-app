import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, CircleAlert, CircleCheck, FileText } from "lucide-react";
import {
  markPndFilingAcceptedAction,
  markPndFilingSubmittedAction,
} from "../../actions";
import { getPayrollPndFilings } from "@/lib/db/queries/payroll";
import { getVerifiedOrgId } from "@/lib/utils/org-context";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Amount } from "@/components/ui/amount";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/status-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

async function submitPndFiling(formData: FormData) {
  "use server";
  const result = await markPndFilingSubmittedAction(formData);
  if (result?.error) {
    redirect(`/payroll/filings/pnd1-kor?error=${encodeURIComponent(result.error)}`);
  }
  redirect("/payroll/filings/pnd1-kor?status=PND.1 Kor filing submitted");
}

async function acceptPndFiling(formData: FormData) {
  "use server";
  const result = await markPndFilingAcceptedAction(formData);
  if (result?.error) {
    redirect(`/payroll/filings/pnd1-kor?error=${encodeURIComponent(result.error)}`);
  }
  redirect("/payroll/filings/pnd1-kor?status=PND.1 Kor filing accepted");
}

export default async function PayrollPnd1KorFilingsPage({
  searchParams,
}: {
  searchParams?: Promise<{ error?: string; status?: string }>;
}) {
  const orgId = await getVerifiedOrgId();
  const messages = searchParams ? await searchParams : {};
  const filings = orgId ? await getPayrollPndFilings(orgId, { formType: "PND1KOR" }) : [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="PND.1 Kor Filings"
        description="Annual payroll withholding summaries and reconciliation totals."
      >
        <Button variant="outline" render={<Link href="/payroll" />}>
          <ArrowLeft className="mr-2 size-4" />
          Payroll
        </Button>
      </PageHeader>

      {messages.error ? (
        <Alert variant="destructive">
          <CircleAlert />
          <AlertDescription>{messages.error}</AlertDescription>
        </Alert>
      ) : null}
      {messages.status ? (
        <Alert variant="success">
          <CircleCheck />
          <AlertDescription>{messages.status}</AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Annual PND.1 Kor</CardTitle>
        </CardHeader>
        <CardContent>
          {filings.length === 0 ? (
            <EmptyState
              icon={<FileText />}
              title="No PND.1 Kor filings drafted yet."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tax year</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>RD ref</TableHead>
                  <TableHead className="text-right">Employees</TableHead>
                  <TableHead className="text-right">Gross</TableHead>
                  <TableHead className="text-right">WHT</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filings.map((filing) => (
                  <TableRow key={filing.id}>
                    <TableCell className="font-medium">{filing.taxPeriod}</TableCell>
                    <TableCell>
                      <StatusBadge status={filing.filingStatus} />
                    </TableCell>
                    <TableCell>{filing.rdReferenceNumber ?? "-"}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {filing.totalPayees ?? 0}
                    </TableCell>
                    <TableCell className="text-right">
                      <Amount value={filing.totalGrossAmount} />
                    </TableCell>
                    <TableCell className="text-right">
                      <Amount value={filing.totalWhtAmount} />
                    </TableCell>
                    <TableCell className="text-right">
                      {filing.filingStatus === "draft" ||
                      filing.filingStatus === "rejected" ? (
                        <form action={submitPndFiling} className="flex justify-end gap-2">
                          <input type="hidden" name="filingId" value={filing.id} />
                          <Input
                            aria-label={`RD reference ${filing.taxPeriod}`}
                            className="h-8 w-40"
                            name="rdReferenceNumber"
                            placeholder="RD reference"
                            required
                          />
                          <Button type="submit" size="sm" variant="outline">
                            Submit
                          </Button>
                        </form>
                      ) : filing.filingStatus === "submitted" ? (
                        <form action={acceptPndFiling} className="flex justify-end gap-2">
                          <input type="hidden" name="filingId" value={filing.id} />
                          <Input
                            aria-label={`Accepted RD reference ${filing.taxPeriod}`}
                            className="h-8 w-40"
                            name="rdReferenceNumber"
                            defaultValue={filing.rdReferenceNumber ?? ""}
                          />
                          <Button type="submit" size="sm" variant="outline">
                            Accept
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
