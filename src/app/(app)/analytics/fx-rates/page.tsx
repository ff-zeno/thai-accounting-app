import { AlertTriangle, Landmark } from "lucide-react";
import {
  getBotFxRateCoverage,
  getRecentBotFxRates,
} from "@/lib/db/queries/fx-rates-bot";
import { getVerifiedOrgId } from "@/lib/utils/org-context";
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
import {
  recordBotFxRateAction,
  retryPreviousMonthEndFxRevaluationAction,
  runFxRevaluationAction,
} from "./actions";

const botSourceUrl =
  "https://portal.api.bot.or.th/portal/catalogue-products/exchange-rates-1";

async function submitFxRate(formData: FormData) {
  "use server";
  await recordBotFxRateAction(formData);
}

async function submitFxRevaluation(formData: FormData) {
  "use server";
  await runFxRevaluationAction(formData);
}

async function retryPreviousMonthEndFxRevaluation() {
  "use server";
  await retryPreviousMonthEndFxRevaluationAction();
}

export default async function FxRatesPage({
  searchParams,
}: {
  searchParams?: Promise<{ error?: string; status?: string }>;
}) {
  const orgId = await getVerifiedOrgId();
  const messages = searchParams ? await searchParams : {};
  const [rates, coverage] = orgId
    ? await Promise.all([getRecentBotFxRates(), getBotFxRateCoverage()])
    : [[], null];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">BOT FX Rates</h1>
        <p className="text-sm text-muted-foreground">
          Controlled reference-rate table for FX revaluation. BOT API ingestion runs when credentials are configured; manual entries remain the fallback and must keep source URL evidence.
        </p>
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

      {!orgId ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-2 py-12 text-center">
            <Landmark className="size-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Select an organization to view FX rates.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card className="border-amber-200 bg-amber-50 text-amber-950">
            <CardContent className="flex gap-3 py-4 text-sm">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <div>
                <p className="font-medium">FX revaluation is AR/AP v1.</p>
                <p className="mt-1 text-amber-900">
                  Manual BOT rates, coverage checks, previous-month retry, and fully unpaid
                  foreign AR/AP revaluation are testable. Partially paid documents, bank-account
                  FX, WHT-credit FX, and realized settlement FX remain deferred.
                </p>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader><CardTitle className="text-sm">Rate Rows</CardTitle></CardHeader>
              <CardContent><div className="text-2xl font-semibold">{coverage?.rateCount ?? 0}</div></CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-sm">Currencies</CardTitle></CardHeader>
              <CardContent><div className="text-2xl font-semibold">{coverage?.currencyCount ?? 0}</div></CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-sm">Latest Rate Date</CardTitle></CardHeader>
              <CardContent><div className="text-2xl font-semibold">{coverage?.latestRateDate ?? "-"}</div></CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Record BOT Rate</CardTitle>
            </CardHeader>
            <CardContent>
              <form action={submitFxRate} className="grid gap-4 md:grid-cols-4">
                <div className="space-y-2">
                  <Label htmlFor="rateDate">Rate date</Label>
                  <Input id="rateDate" name="rateDate" type="date" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="currency">Currency</Label>
                  <Input id="currency" name="currency" placeholder="USD" maxLength={3} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="buyingRate">Buying rate</Label>
                  <Input id="buyingRate" name="buyingRate" inputMode="decimal" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="sellingRate">Selling rate</Label>
                  <Input id="sellingRate" name="sellingRate" inputMode="decimal" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="midRate">Mid rate</Label>
                  <Input id="midRate" name="midRate" inputMode="decimal" required />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="sourceUrl">Source URL</Label>
                  <Input id="sourceUrl" name="sourceUrl" defaultValue={botSourceUrl} required />
                </div>
                <div className="flex items-end">
                  <Button type="submit">Record Rate</Button>
                </div>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Run FX Revaluation</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4">
                <form action={submitFxRevaluation} className="grid gap-4 md:grid-cols-[minmax(0,240px)_auto_1fr] md:items-end">
                  <div className="space-y-2">
                    <Label htmlFor="valuationDate">Valuation date</Label>
                    <Input id="valuationDate" name="valuationDate" type="date" required />
                  </div>
                  <Button type="submit">Run Revaluation</Button>
                  <p className="text-sm text-muted-foreground">
                    V1 covers fully unpaid foreign AR/AP documents from stored BOT mid rates. Partially paid documents, bank accounts, WHT credits, and realized FX remain pending.
                  </p>
                </form>
                <form action={retryPreviousMonthEndFxRevaluation}>
                  <Button type="submit" variant="outline">
                    Retry Previous Month End
                  </Button>
                </form>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recent Rates</CardTitle>
            </CardHeader>
            <CardContent>
              {rates.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  No BOT rates recorded yet.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Currency</TableHead>
                      <TableHead className="text-right">Buying</TableHead>
                      <TableHead className="text-right">Selling</TableHead>
                      <TableHead className="text-right">Mid</TableHead>
                      <TableHead>Fetched</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rates.map((rate) => (
                      <TableRow key={`${rate.rateDate}-${rate.currency}`}>
                        <TableCell>{rate.rateDate}</TableCell>
                        <TableCell className="font-mono">{rate.currency}</TableCell>
                        <TableCell className="text-right font-mono">{rate.buyingRate ?? "-"}</TableCell>
                        <TableCell className="text-right font-mono">{rate.sellingRate ?? "-"}</TableCell>
                        <TableCell className="text-right font-mono">{rate.midRate}</TableCell>
                        <TableCell>{rate.fetchedAt.toISOString().slice(0, 10)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
