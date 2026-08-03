import Link from "next/link";
import { BookOpen } from "lucide-react";
import { getActiveOrgId } from "@/lib/utils/org-context";
import { getJournalEntryDetail } from "@/lib/db/queries/general-ledger";
import { Amount } from "@/components/ui/amount";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default async function JournalEntryDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [{ id }, orgId] = await Promise.all([params, getActiveOrgId()]);
  const detail = orgId ? await getJournalEntryDetail(orgId, id) : null;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/accounting/journal" className="text-sm text-muted-foreground hover:underline">
          Back to journal
        </Link>
        <PageHeader
          title="Journal Entry Detail"
          description="Entry header, source trail, and balanced debit/credit lines."
        />
      </div>

      {!orgId || !detail ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-2 py-12 text-center">
            <BookOpen className="size-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Journal entry not found.</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Entry Number</CardTitle>
              </CardHeader>
              <CardContent className="font-medium">{detail.entry.entryNumber}</CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Entry Date</CardTitle>
              </CardHeader>
              <CardContent>{detail.entry.entryDate}</CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Debit</CardTitle>
              </CardHeader>
              <CardContent>
                <Amount value={detail.entry.totalDebit} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Credit</CardTitle>
              </CardHeader>
              <CardContent>
                <Amount value={detail.entry.totalCredit} />
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Source Trail</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2 text-sm md:grid-cols-2">
              <p>Type: {detail.entry.entryType}</p>
              <p>Posting kind: {detail.entry.postingKind ?? "n/a"}</p>
              <p>Source type: {detail.entry.sourceEntityType ?? "n/a"}</p>
              <p>Source ID: {detail.entry.sourceEntityId ?? "n/a"}</p>
              <p>Reversal: {detail.entry.isReversal ? "yes" : "no"}</p>
              <p>Reversed by: {detail.entry.reversedByEntryId ?? "n/a"}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Lines</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Line</TableHead>
                    <TableHead>Account</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="text-right tabular-nums">Debit</TableHead>
                    <TableHead className="text-right tabular-nums">Credit</TableHead>
                    <TableHead>Subledger</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detail.lines.map((line) => (
                    <TableRow key={line.id}>
                      <TableCell>{line.lineNumber}</TableCell>
                      <TableCell>
                        {line.accountCode} {line.accountNameEn}
                      </TableCell>
                      <TableCell>{line.description ?? "n/a"}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        <Amount value={line.debitAmount} />
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        <Amount value={line.creditAmount} />
                      </TableCell>
                      <TableCell>
                        {line.subledgerEntityType
                          ? `${line.subledgerEntityType}:${line.subledgerEntityId ?? ""}`
                          : "n/a"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
