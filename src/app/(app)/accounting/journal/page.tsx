import Link from "next/link";
import { BookOpen } from "lucide-react";
import { getActiveOrgId } from "@/lib/utils/org-context";
import { getJournalEntryList } from "@/lib/db/queries/general-ledger";
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

export default async function JournalPage() {
  const orgId = await getActiveOrgId();
  const entries = orgId ? await getJournalEntryList(orgId) : [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Journal Entries"
        description="Drill through posted entries, source references, reversals, and line totals."
      />

      {!orgId ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-2 py-12 text-center">
            <BookOpen className="size-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Select an organization to view journal entries.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Recent Journal Entries</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Number</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead className="text-right tabular-nums">Debit</TableHead>
                  <TableHead className="text-right tabular-nums">Credit</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell>
                      <Link
                        href={`/accounting/journal/${entry.id}`}
                        className="font-medium underline-offset-4 hover:underline"
                      >
                        {entry.entryNumber}
                      </Link>
                    </TableCell>
                    <TableCell>{entry.entryDate}</TableCell>
                    <TableCell>{entry.entryType}</TableCell>
                    <TableCell>
                      {entry.sourceEntityType
                        ? `${entry.sourceEntityType}:${entry.sourceEntityId ?? ""}`
                        : entry.postingKind ?? "manual"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      <Amount value={entry.totalDebit} />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      <Amount value={entry.totalCredit} />
                    </TableCell>
                  </TableRow>
                ))}
                {entries.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-muted-foreground">
                      No journal entries yet.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
