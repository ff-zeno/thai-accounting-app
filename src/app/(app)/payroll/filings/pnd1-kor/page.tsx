import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, FileText } from "lucide-react";
import {
  markPndFilingAcceptedAction,
  markPndFilingSubmittedAction,
} from "../../actions";
import { getPayrollPndFilings } from "@/lib/db/queries/payroll";
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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">PND.1 Kor Filings</h1>
          <p className="text-sm text-muted-foreground">
            Annual payroll withholding summaries and reconciliation totals.
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
          <CardTitle>Annual PND.1 Kor</CardTitle>
        </CardHeader>
        <CardContent>
          {filings.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
              <FileText className="size-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                No PND.1 Kor filings drafted yet.
              </p>
            </div>
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
                    <TableCell>{filing.filingStatus}</TableCell>
                    <TableCell>{filing.rdReferenceNumber ?? "-"}</TableCell>
                    <TableCell className="text-right font-mono">
                      {filing.totalPayees ?? 0}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {amount(filing.totalGrossAmount)}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {amount(filing.totalWhtAmount)}
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
