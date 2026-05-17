import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { getActiveOrgId } from "@/lib/utils/org-context";
import { getPostingOutboxDashboard } from "@/lib/db/queries/posting-outbox";
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
import { drainPostingOutboxAction, retryPostingOutboxAction } from "../actions";

async function retryPosting(formData: FormData) {
  "use server";
  const result = await retryPostingOutboxAction(formData);
  const params = new URLSearchParams();
  if (result?.error) params.set("postingMessage", result.error);
  else params.set("postingMessage", "Posting row retried.");
  redirect(`/accounting/posting-exceptions?${params.toString()}`);
}

async function drainPosting(formData: FormData) {
  "use server";
  const throughDate = String(formData.get("throughDate") ?? "").trim();
  const result = await drainPostingOutboxAction(formData);
  const params = new URLSearchParams();
  if (throughDate) params.set("throughDate", throughDate);
  if ("success" in result && result.success) {
    params.set(
      "postingMessage",
      `Drain complete: ${result.posted ?? 0} posted, ${result.failed ?? 0} failed.`
    );
  } else {
    params.set("postingMessage", result.error ?? "Posting outbox could not be drained");
  }
  redirect(`/accounting/posting-exceptions?${params.toString()}`);
}

function dateParam(value: string | undefined) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value ?? "") ? value : undefined;
}

export default async function PostingExceptionsPage({
  searchParams,
}: {
  searchParams: Promise<{ throughDate?: string; postingMessage?: string }>;
}) {
  const [{ throughDate: rawThroughDate, postingMessage }, orgId] = await Promise.all([
    searchParams,
    getActiveOrgId(),
  ]);
  const throughDate = dateParam(rawThroughDate);
  const dashboard = orgId ? await getPostingOutboxDashboard(orgId, 25, throughDate) : null;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/accounting" className="text-sm text-muted-foreground hover:underline">
          Back to accounting
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Posting Queue</h1>
        <p className="text-sm text-muted-foreground">
          Inspect GL posting outbox rows before closing a period.
        </p>
      </div>

      {!orgId || !dashboard ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-2 py-12 text-center">
            <AlertTriangle className="size-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Select an organization to view posting queue.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Queue Filter</CardTitle>
            </CardHeader>
            <CardContent>
              {postingMessage ? (
                <div className="mb-4 rounded-md border border-border bg-muted px-3 py-2 text-sm">
                  {postingMessage}
                </div>
              ) : null}
              <form
                className="grid gap-3 md:grid-cols-[12rem_auto]"
                action="/accounting/posting-exceptions"
              >
                <Input name="throughDate" type="date" defaultValue={throughDate ?? ""} />
                <button
                  type="submit"
                  className="h-9 rounded-md border border-input px-3 text-sm hover:bg-muted"
                >
                  Apply
                </button>
              </form>
              <p className="mt-2 text-sm text-muted-foreground">
                {throughDate ? `Showing rows through ${throughDate}.` : "Showing all queue rows."}
              </p>
              <form action={drainPosting} className="mt-4 flex items-center gap-3">
                <input type="hidden" name="throughDate" value={throughDate ?? ""} />
                <Button type="submit" disabled={!throughDate}>
                  Drain Queue
                </Button>
                <span className="text-sm text-muted-foreground">
                  {throughDate
                    ? "Process pending rows through selected date."
                    : "Select through date before draining."}
                </span>
              </form>
            </CardContent>
          </Card>

          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Pending</CardTitle>
              </CardHeader>
              <CardContent className="text-2xl font-semibold">
                {dashboard.summary.pending}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Retrying</CardTitle>
              </CardHeader>
              <CardContent className="text-2xl font-semibold">
                {dashboard.summary.retrying}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Failed</CardTitle>
              </CardHeader>
              <CardContent className="text-2xl font-semibold">
                {dashboard.summary.failed}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Posted</CardTitle>
              </CardHeader>
              <CardContent className="text-2xl font-semibold">
                {dashboard.summary.posted}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Open Posting Exceptions</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Source</TableHead>
                    <TableHead>Class</TableHead>
                    <TableHead>Message</TableHead>
                    <TableHead>Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dashboard.exceptions.map((exception) => (
                    <TableRow key={exception.id}>
                      <TableCell>
                        {exception.sourceEntityType}:{exception.sourceEntityId}
                      </TableCell>
                      <TableCell>{exception.failureClass}</TableCell>
                      <TableCell>{exception.message}</TableCell>
                      <TableCell>
                        <form action={retryPosting}>
                          <input
                            type="hidden"
                            name="postingOutboxId"
                            value={exception.postingOutboxId}
                          />
                          <Button type="submit" size="sm" variant="outline">
                            Retry
                          </Button>
                        </form>
                      </TableCell>
                    </TableRow>
                  ))}
                  {dashboard.exceptions.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-muted-foreground">
                        No open posting exceptions.
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recent Outbox Rows</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Source</TableHead>
                    <TableHead>Event</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Attempts</TableHead>
                    <TableHead>Last error</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dashboard.rows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>
                        {row.sourceEntityType}:{row.sourceEntityId}
                      </TableCell>
                      <TableCell>{row.eventType}</TableCell>
                      <TableCell>{row.postingStatus}</TableCell>
                      <TableCell>{row.postingAttempts}</TableCell>
                      <TableCell>{row.lastError ?? "n/a"}</TableCell>
                    </TableRow>
                  ))}
                  {dashboard.rows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-muted-foreground">
                        No posting outbox rows yet.
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
