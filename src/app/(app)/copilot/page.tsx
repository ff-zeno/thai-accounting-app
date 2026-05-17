import { Bot, ShieldCheck } from "lucide-react";
import { getActiveOrgId } from "@/lib/utils/org-context";
import { getCurrentUser } from "@/lib/utils/auth";
import { getCopilotDashboard } from "@/lib/db/queries/copilot-tools";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { runCopilotPromptAction, runCopilotToolAction } from "./actions";

async function runTool(formData: FormData) {
  "use server";
  await runCopilotToolAction(formData);
}

async function runPrompt(formData: FormData) {
  "use server";
  await runCopilotPromptAction(formData);
}

function bangkokYearMonth() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date());
  return {
    year: Number(parts.find((part) => part.type === "year")?.value),
    month: Number(parts.find((part) => part.type === "month")?.value),
  };
}

export default async function CopilotPage() {
  const [orgId, user] = await Promise.all([getActiveOrgId(), getCurrentUser()]);
  const dashboard = orgId && user ? await getCopilotDashboard(orgId, user.id) : null;
  const { year, month } = bangkokYearMonth();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Accounting Copilot</h1>
        <p className="text-sm text-muted-foreground">
          Read-only tool runner for scoped accounting search and tax-position previews.
        </p>
      </div>

      <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-800">
        Live model orchestration is preview-only. Prompts currently route through
        deterministic audited tools; write-capable tools still require preview,
        role checks, confirmation, period-lock checks, and audit events.
      </div>

      {!orgId || !user || !dashboard ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-2 py-12 text-center">
            <Bot className="size-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Select an organization to use copilot tools.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Ask Copilot</CardTitle>
            </CardHeader>
            <CardContent>
              <form action={runPrompt} className="grid gap-3 md:grid-cols-[1fr_auto]">
                <div className="space-y-2">
                  <Label htmlFor="prompt">Prompt</Label>
                  <Input
                    id="prompt"
                    name="prompt"
                    placeholder='Find documents "INV-001" or show VAT position 2026-05'
                  />
                </div>
                <div className="self-end">
                  <Button type="submit">Ask Copilot</Button>
                </div>
              </form>
              <p className="mt-2 text-xs text-muted-foreground">
                Natural-language prompts route to the same audited tools below. Write-capable actions still require their tool-specific confirmation gates.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Run Tool</CardTitle>
            </CardHeader>
            <CardContent>
              <form action={runTool} className="grid gap-4 md:grid-cols-5">
                <div className="space-y-2">
                  <Label htmlFor="toolName">Tool</Label>
                  <select
                    id="toolName"
                    name="toolName"
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                    defaultValue="search_documents"
                  >
                    {dashboard.tools.map((tool) => (
                      <option key={tool.name} value={tool.name}>
                        {tool.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="query">Search query</Label>
                  <Input id="query" name="query" placeholder="invoice, vendor, account code" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="targetAccountCode">Target account</Label>
                  <Input id="targetAccountCode" name="targetAccountCode" defaultValue="6110" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirmationText">Confirmation</Label>
                  <Input id="confirmationText" name="confirmationText" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="periodYear">Tax year</Label>
                  <Input id="periodYear" name="periodYear" inputMode="numeric" defaultValue={year} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="periodMonth">Tax month</Label>
                  <Input id="periodMonth" name="periodMonth" inputMode="numeric" defaultValue={month} />
                </div>
                <div className="md:col-span-5">
                  <Button type="submit">Run Tool</Button>
                </div>
              </form>
            </CardContent>
          </Card>

          <div className="grid gap-4 md:grid-cols-2">
            {dashboard.tools.map((tool) => (
              <Card key={tool.name}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <ShieldCheck className="size-4" />
                    {tool.name}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <p className="text-muted-foreground">{tool.description}</p>
                  <p>Risk: {tool.risk}</p>
                  <p>Preview required: {tool.previewRequired ? "yes" : "no"}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Recent Tool Events</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tool</TableHead>
                    <TableHead>Risk</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dashboard.recentEvents.map((event) => (
                    <TableRow key={event.id}>
                      <TableCell>{event.toolName}</TableCell>
                      <TableCell>{event.risk}</TableCell>
                      <TableCell>{event.status}</TableCell>
                      <TableCell>{event.createdAt.toISOString()}</TableCell>
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
