import Link from "next/link";
import { AlertTriangle, CheckCircle2, LockKeyhole } from "lucide-react";
import { getActiveOrgId } from "@/lib/utils/org-context";
import { getCloseDashboard } from "@/lib/db/queries/close-checklists";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  closeChecklistAction,
  ensureCloseChecklistAction,
  postYearEndCloseAction,
  updateCloseChecklistItemAction,
} from "./actions";

async function openChecklist(formData: FormData) {
  "use server";
  await ensureCloseChecklistAction(formData);
}

async function updateItem(formData: FormData) {
  "use server";
  await updateCloseChecklistItemAction(formData);
}

async function closeChecklist(formData: FormData) {
  "use server";
  await closeChecklistAction(formData);
}

async function postYearEndClose(formData: FormData) {
  "use server";
  await postYearEndCloseAction(formData);
}

// Deep links from checklist items to the page where each is resolved.
const CHECKLIST_ITEM_LINKS: Record<string, { href: string; label: string }> = {
  bank_reconciliation: { href: "/reconciliation", label: "Open reconciliation" },
  ar_aging_reviewed: { href: "/analytics/ar-aging", label: "Open AR aging" },
  ap_aging_reviewed: { href: "/analytics/ap-aging", label: "Open AP aging" },
  pos_settlement_reconciled: { href: "/sales", label: "Open sales control tower" },
  cash_deposits_matched: { href: "/sales", label: "Open sales control tower" },
  pp30_prepared: { href: "/tax/vat", label: "Open VAT workspace" },
  pnd_prepared: { href: "/tax/withholding/filings", label: "Open WHT filings" },
  sso_prepared: { href: "/payroll/filings/sso", label: "Open SSO filings" },
  month_end_adjustments: { href: "/accounting/journal", label: "Open journal" },
  fx_revaluation_run: { href: "/analytics/fx-rates", label: "Open FX rates" },
  depreciation_posted: { href: "/fixed-assets", label: "Open fixed assets" },
  trial_balance_reviewed: {
    href: "/accounting/reports/trial-balance",
    label: "Open trial balance",
  },
  period_locked: { href: "/accounting", label: "Open general ledger" },
};

export default async function ClosePage() {
  const orgId = await getActiveOrgId();
  const dashboard = orgId ? await getCloseDashboard(orgId) : null;
  const now = new Date();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Close Checklist"
        description="Monthly close control list for reconciliations, tax prep, adjustments, and lock readiness."
      >
        <Button variant="outline" render={<Link href="/year-end/cit" />}>
          CIT Workbench
        </Button>
      </PageHeader>

      <Alert variant="warning">
        <AlertTriangle />
        <AlertDescription>
          Year-end close can post retained earnings when readiness checks pass, but
          DBD/TFRS financial statements and the DBD Builder/auditor pack are still
          externally blocked pending CPA review and authenticated Builder validation.
        </AlertDescription>
      </Alert>

      {!orgId || !dashboard ? (
        <Card>
          <CardContent>
            <EmptyState
              icon={<LockKeyhole />}
              title="Select an organization to view close controls."
            />
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <StatCard label="Open Checklists" value={dashboard.summary.openCount} />
            <StatCard label="Closed Periods" value={dashboard.summary.closedCount} />
            <StatCard label="Blocked Items" value={dashboard.summary.blockedItemCount} />
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between gap-3">
                <span>GL Posting Queue Readiness</span>
                <Link
                  href={`/accounting/posting-exceptions?throughDate=${dashboard.postingQueue.throughDate}`}
                  className="text-sm font-normal text-muted-foreground underline-offset-4 hover:underline"
                >
                  Open posting queue
                </Link>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="mb-4 text-2xl font-semibold">
                {dashboard.postingQueue.ready ? "Ready" : "Blocked"}
              </div>
              <p className="mb-4 text-sm text-muted-foreground">
                Queue rows through {dashboard.postingQueue.throughDate}.
              </p>
              <div className="grid gap-3 text-sm md:grid-cols-4">
                <div>Pending: {dashboard.postingQueue.summary.pending}</div>
                <div>Retrying: {dashboard.postingQueue.summary.retrying}</div>
                <div>Failed: {dashboard.postingQueue.summary.failed}</div>
                <div>Open exceptions: {dashboard.postingQueue.exceptions.length}</div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Open Period</CardTitle>
            </CardHeader>
            <CardContent>
              <form action={openChecklist} className="grid gap-4 md:grid-cols-4">
                <div className="space-y-2">
                  <Label htmlFor="periodYear">Year</Label>
                  <Input id="periodYear" name="periodYear" inputMode="numeric" defaultValue={now.getUTCFullYear()} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="periodMonth">Month</Label>
                  <Input id="periodMonth" name="periodMonth" inputMode="numeric" defaultValue={now.getUTCMonth() + 1} />
                </div>
                <div className="flex items-end md:col-span-2">
                  <Button type="submit">Open Checklist</Button>
                </div>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>
                Year-end Close Readiness {dashboard.yearEndReadiness.taxYear}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="mb-4 text-2xl font-semibold">
                {dashboard.yearEndReadiness.ready ? "Ready" : "Blocked"}
              </div>
              <form action={postYearEndClose} className="mb-4 flex flex-wrap items-end gap-3">
                <div className="space-y-2">
                  <Label htmlFor="taxYear">Tax year</Label>
                  <Input
                    id="taxYear"
                    name="taxYear"
                    inputMode="numeric"
                    defaultValue={dashboard.yearEndReadiness.taxYear}
                    className="w-32"
                  />
                </div>
                <Button type="submit" disabled={!dashboard.yearEndReadiness.ready}>
                  Post Year-end Close
                </Button>
              </form>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Check</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Evidence</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dashboard.yearEndReadiness.checks.map((check) => (
                    <TableRow key={check.key}>
                      <TableCell>{check.label}</TableCell>
                      <TableCell>
                        <StatusBadge status={check.status} />
                      </TableCell>
                      <TableCell>{check.evidenceId ?? "-"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>
                Current Checklist {dashboard.currentChecklist.periodYear}-{String(dashboard.currentChecklist.periodMonth).padStart(2, "0")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {dashboard.currentItems.map((item) => {
                  const link = CHECKLIST_ITEM_LINKS[item.itemKey];
                  return (
                    <form
                      key={item.id}
                      action={updateItem}
                      className="grid gap-3 rounded-md border p-3 md:grid-cols-[48px_1fr_140px_180px]"
                    >
                      <div className="text-sm text-muted-foreground">{item.sequence}</div>
                      <div>
                        <div className="font-medium">{item.description}</div>
                        <div className="text-xs text-muted-foreground">{item.itemKey}</div>
                        {link ? (
                          <Link
                            href={link.href}
                            className="text-xs text-muted-foreground underline-offset-4 hover:underline"
                          >
                            {link.label}
                          </Link>
                        ) : null}
                      </div>
                      <NativeSelect
                        name="status"
                        defaultValue={item.status}
                        className="w-full"
                      >
                        <option value="pending">Pending</option>
                        <option value="done">Done</option>
                        <option value="skipped">Skipped</option>
                        <option value="blocked">Blocked</option>
                      </NativeSelect>
                      <div className="flex items-center gap-2">
                        <input type="hidden" name="itemId" value={item.id} />
                        <Button type="submit" size="sm" variant="outline">
                          Save
                        </Button>
                        {item.status === "done" ? (
                          <CheckCircle2 className="size-4 text-success" />
                        ) : null}
                      </div>
                    </form>
                  );
                })}
              </div>
              <form action={closeChecklist} className="mt-4">
                <input
                  type="hidden"
                  name="checklistId"
                  value={dashboard.currentChecklist.id}
                />
                <Button type="submit" variant="outline">
                  Close Period Checklist
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recent Close Periods</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Period</TableHead>
                    <TableHead>Branch</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Done</TableHead>
                    <TableHead>Blocked</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dashboard.recentChecklists.map((checklist) => (
                    <TableRow key={checklist.id}>
                      <TableCell>
                        {checklist.periodYear}-{String(checklist.periodMonth).padStart(2, "0")}
                      </TableCell>
                      <TableCell>{checklist.branchNumber ?? "-"}</TableCell>
                      <TableCell>
                        <StatusBadge status={checklist.status} />
                      </TableCell>
                      <TableCell>{checklist.doneCount} / {checklist.itemCount}</TableCell>
                      <TableCell>{checklist.blockedCount}</TableCell>
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
