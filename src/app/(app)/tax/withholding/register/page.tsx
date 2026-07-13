import Link from "next/link";
import { getWhtRegisterRows } from "@/lib/db/queries/wht-register";
import { getActiveOrgId } from "@/lib/utils/org-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

function amount(value: string | number | null | undefined) {
  return Number(value ?? 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function rate(value: string | null | undefined) {
  return `${(Number(value ?? 0) * 100).toFixed(2)}%`;
}

function formLabel(value: string) {
  return value.toUpperCase().replace("PND", "PND ");
}

export default async function WhtRegisterPage() {
  const orgId = await getActiveOrgId();
  const rows = orgId ? await getWhtRegisterRows(orgId) : [];

  const incomingTotal = rows
    .filter((row) => row.direction === "incoming")
    .reduce((sum, row) => sum + Number(row.whtAmount ?? 0), 0);
  const outgoingTotal = rows
    .filter((row) => row.direction === "outgoing")
    .reduce((sum, row) => sum + Number(row.whtAmount ?? 0), 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">WHT Register</h1>
        <p className="text-sm text-muted-foreground">
          Source-linked incoming credits, outgoing certificates, forms, filing periods, and evidence status.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader><CardTitle className="text-sm">Incoming Credits</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-semibold">{amount(incomingTotal)}</div></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm">Outgoing Withheld</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-semibold">{amount(outgoingTotal)}</div></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm">Register Rows</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-semibold">{rows.length}</div></CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Evidence Register</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Direction</TableHead>
                <TableHead>Counterparty</TableHead>
                <TableHead>Payment date</TableHead>
                <TableHead>Form</TableHead>
                <TableHead className="text-right">Gross</TableHead>
                <TableHead className="text-right">Rate</TableHead>
                <TableHead className="text-right">WHT</TableHead>
                <TableHead>Evidence</TableHead>
                <TableHead>Filing</TableHead>
                <TableHead>Source</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} className="py-8 text-center text-sm text-muted-foreground">
                    No WHT register rows yet.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((row) => (
                  <TableRow key={`${row.direction}-${row.id}`}>
                    <TableCell className="capitalize">{row.direction}</TableCell>
                    <TableCell>{row.counterpartyName}</TableCell>
                    <TableCell>{row.paymentDate ?? "-"}</TableCell>
                    <TableCell>{formLabel(row.formType)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {amount(row.grossAmount)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{rate(row.whtRate)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {amount(row.whtAmount)}
                    </TableCell>
                    <TableCell>{row.certificateStatus}</TableCell>
                    <TableCell>
                      {row.filingPeriod ?? "-"} / {row.filingStatus}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-2">
                        {row.sourceDocumentId ? (
                          <Link
                            className="text-primary underline-offset-4 hover:underline"
                            href={`/documents/${row.sourceDocumentId}/review`}
                          >
                            Document
                          </Link>
                        ) : null}
                        {row.direction === "incoming" ? (
                          <Link
                            className="text-primary underline-offset-4 hover:underline"
                            href="/tax/withholding/incoming"
                          >
                            Credit
                          </Link>
                        ) : (
                          <Link
                            className="text-primary underline-offset-4 hover:underline"
                            href="/tax/withholding/outgoing"
                          >
                            Certificate
                          </Link>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
