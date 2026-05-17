import Link from "next/link";
import { BookOpen } from "lucide-react";
import { getActiveOrgId } from "@/lib/utils/org-context";
import { getJournalEntryList } from "@/lib/db/queries/general-ledger";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

export default async function JournalPage() {
  const orgId = await getActiveOrgId();
  const entries = orgId ? await getJournalEntryList(orgId) : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Journal Entries</h1>
        <p className="text-sm text-muted-foreground">
          Drill through posted entries, source references, reversals, and line totals.
        </p>
      </div>

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
                  <TableHead>Debit</TableHead>
                  <TableHead>Credit</TableHead>
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
                    <TableCell>{amount(entry.totalDebit)}</TableCell>
                    <TableCell>{amount(entry.totalCredit)}</TableCell>
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
