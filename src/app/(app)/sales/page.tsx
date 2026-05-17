import { AlertTriangle, Store } from "lucide-react";
import { getActiveOrgId } from "@/lib/utils/org-context";
import { getPosSalesWorkflowDashboard } from "@/lib/db/queries/pos-sales-ledger";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  createManualPosSaleAction,
  importPosSalesCsvAction,
  recordCashDepositAction,
  recordProcessorSettlementAction,
} from "./actions";

async function submitManualPosSale(formData: FormData) {
  "use server";
  await createManualPosSaleAction(formData);
}

async function submitPosCsvImport(formData: FormData) {
  "use server";
  await importPosSalesCsvAction(formData);
}

async function submitCashDeposit(formData: FormData) {
  "use server";
  await recordCashDepositAction(formData);
}

async function submitProcessorSettlement(formData: FormData) {
  "use server";
  await recordProcessorSettlementAction(formData);
}

function amount(value: string | null | undefined) {
  return Number(value ?? 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function bangkokDate(value: Date) {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const part = (type: string) =>
    parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function dateOnly(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? String(value).slice(0, 10) : bangkokDate(date);
}

export default async function SalesPage() {
  const orgId = await getActiveOrgId();
  const dashboard = orgId ? await getPosSalesWorkflowDashboard(orgId) : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Sales Control Tower
        </h1>
        <p className="text-sm text-muted-foreground">
          POS gross sales, processor settlements, cash deposits, vouchers, and Section 87 source evidence.
        </p>
      </div>

      {!orgId || !dashboard ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-2 py-12 text-center">
            <Store className="size-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Select an organization to view sales controls.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card className="border-amber-200 bg-amber-50 text-amber-950">
            <CardContent className="flex gap-3 py-4 text-sm">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <div>
                <p className="font-medium">Sales controls are manual/CSV v1.</p>
                <p className="mt-1 text-amber-900">
                  Manual sales, normalized POS CSV paste import, cash deposits, processor
                  settlements, VAT output, and GL posting are testable. Processor matching,
                  cash variance resolution, cash-slip OCR/bank matching, connector imports,
                  and Excel/PDF statutory exports remain deferred.
                </p>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Gross POS Sales</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold">
                  {amount(dashboard.salesSummary.grossSales)}
                </div>
                <p className="text-xs text-muted-foreground">
                  Output VAT {amount(dashboard.salesSummary.outputVat)}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Money In Pipe</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold">
                  {amount(dashboard.salesSummary.unsettledGross)}
                </div>
                <p className="text-xs text-muted-foreground">
                  Pending POS sales before settlement.
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Processor Net</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold">
                  {amount(dashboard.settlementSummary.netPayout)}
                </div>
                <p className="text-xs text-muted-foreground">
                  Fee VAT needing evidence {amount(dashboard.settlementSummary.feeVatPendingEvidence)}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Cash Deposits</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold">
                  {amount(dashboard.cashSummary.depositedAmount)}
                </div>
                <p className="text-xs text-muted-foreground">
                  Open variance {amount(dashboard.cashSummary.openVariance)}
                </p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Channel Balances</CardTitle>
            </CardHeader>
            <CardContent>
              {dashboard.channelBalances.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  No pending channel balances.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Branch</TableHead>
                      <TableHead>Clearing account</TableHead>
                      <TableHead className="text-right">Sales</TableHead>
                      <TableHead className="text-right">Pending gross</TableHead>
                      <TableHead>Oldest sale</TableHead>
                      <TableHead className="text-right">Aged</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dashboard.channelBalances.map((balance) => (
                      <TableRow
                        key={`${balance.establishmentId}:${balance.clearingAccountKey}`}
                      >
                        <TableCell>{balance.branchNumber}</TableCell>
                        <TableCell>{balance.clearingAccountKey}</TableCell>
                        <TableCell className="text-right">
                          {balance.saleCount}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {amount(balance.pendingGross)}
                        </TableCell>
                        <TableCell>
                          {dateOnly(balance.oldestSoldAt)}
                        </TableCell>
                        <TableCell className="text-right">
                          {balance.agedCount}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Manual POS Sale</CardTitle>
            </CardHeader>
            <CardContent>
              <form action={submitManualPosSale} className="grid gap-4 md:grid-cols-4">
                <div className="space-y-2">
                  <Label htmlFor="soldAt">Sale date</Label>
                  <Input id="soldAt" name="soldAt" type="date" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="channel">Channel</Label>
                  <select
                    id="channel"
                    name="channel"
                    required
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                    defaultValue="cash"
                  >
                    <option value="cash">Cash</option>
                    <option value="card">Card</option>
                    <option value="qr_promptpay">QR PromptPay</option>
                    <option value="marketplace_shopee">Shopee</option>
                    <option value="marketplace_lazada">Lazada</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="taxInvoiceType">Tax invoice</Label>
                  <select
                    id="taxInvoiceType"
                    name="taxInvoiceType"
                    required
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                    defaultValue="abb"
                  >
                    <option value="abb">ABB</option>
                    <option value="full_ti">Full tax invoice</option>
                    <option value="e_tax_invoice">E-tax invoice</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="taxInvoiceNumber">Invoice no.</Label>
                  <Input id="taxInvoiceNumber" name="taxInvoiceNumber" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="terminalId">Terminal</Label>
                  <Input id="terminalId" name="terminalId" defaultValue="manual" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="amountIncludingVat">Gross</Label>
                  <Input id="amountIncludingVat" name="amountIncludingVat" inputMode="decimal" placeholder="1070.00" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="taxBaseExVat">Base ex VAT</Label>
                  <Input id="taxBaseExVat" name="taxBaseExVat" inputMode="decimal" placeholder="1000.00" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="vatAmount">VAT</Label>
                  <Input id="vatAmount" name="vatAmount" inputMode="decimal" placeholder="70.00" required />
                </div>
                <div className="md:col-span-4">
                  <Button type="submit">Record Sale</Button>
                </div>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>POS CSV Import</CardTitle>
            </CardHeader>
            <CardContent>
              <form action={submitPosCsvImport} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="csvText">CSV rows</Label>
                  <Textarea
                    id="csvText"
                    name="csvText"
                    className="min-h-36 font-mono text-xs"
                    placeholder={[
                      "external_id,sold_at,channel,amount_including_vat,tax_base_ex_vat,vat_amount,tax_invoice_type,tax_invoice_number,terminal_id,clearing_account_key",
                      "zort-1001,2026-05-01,cash,1070.00,1000.00,70.00,abb,ABB-1001,T01,cash_T01",
                    ].join("\n")}
                  />
                </div>
                <Button type="submit">Import POS CSV</Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Cash Deposit Slip</CardTitle>
            </CardHeader>
            <CardContent>
              <form action={submitCashDeposit} className="grid gap-4 md:grid-cols-4">
                <div className="space-y-2">
                  <Label htmlFor="depositedAt">Deposit date</Label>
                  <Input id="depositedAt" name="depositedAt" type="date" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="amount">Amount</Label>
                  <Input id="amount" name="amount" inputMode="decimal" placeholder="1000.00" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="depositedBy">Deposited by</Label>
                  <Input id="depositedBy" name="depositedBy" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="slipReference">Slip reference</Label>
                  <Input id="slipReference" name="slipReference" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="posCashPeriodStart">Cash period start</Label>
                  <Input id="posCashPeriodStart" name="posCashPeriodStart" type="date" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="posCashPeriodEnd">Cash period end</Label>
                  <Input id="posCashPeriodEnd" name="posCashPeriodEnd" type="date" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cashVariance">Cash variance</Label>
                  <Input id="cashVariance" name="cashVariance" inputMode="decimal" placeholder="-50.00" />
                </div>
                <div className="flex items-end">
                  <Button type="submit">Record Deposit</Button>
                </div>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Processor Settlement</CardTitle>
            </CardHeader>
            <CardContent>
              <form action={submitProcessorSettlement} className="grid gap-4 md:grid-cols-4">
                <div className="space-y-2">
                  <Label htmlFor="processor">Processor</Label>
                  <Input id="processor" name="processor" placeholder="ksher" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="externalId">Settlement reference</Label>
                  <Input id="externalId" name="externalId" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="periodStart">Period start</Label>
                  <Input id="periodStart" name="periodStart" type="date" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="periodEnd">Period end</Label>
                  <Input id="periodEnd" name="periodEnd" type="date" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="grossAmount">Gross amount</Label>
                  <Input id="grossAmount" name="grossAmount" inputMode="decimal" placeholder="1070.00" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="feeAmount">Fee ex VAT</Label>
                  <Input id="feeAmount" name="feeAmount" inputMode="decimal" placeholder="20.00" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="netPayout">Net payout</Label>
                  <Input id="netPayout" name="netPayout" inputMode="decimal" placeholder="1050.00" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="reconciliationDiscrepancy">Discrepancy</Label>
                  <Input id="reconciliationDiscrepancy" name="reconciliationDiscrepancy" inputMode="decimal" placeholder="0.00" />
                </div>
                <div className="flex items-end md:col-span-4">
                  <Button type="submit">Record Settlement</Button>
                </div>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recent POS Sales</CardTitle>
            </CardHeader>
            <CardContent>
              {dashboard.recentSales.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  No POS sales recorded yet.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Sold at</TableHead>
                      <TableHead>Branch</TableHead>
                      <TableHead>Channel</TableHead>
                      <TableHead>Invoice</TableHead>
                      <TableHead className="text-right">Gross</TableHead>
                      <TableHead className="text-right">VAT</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dashboard.recentSales.map((sale) => (
                      <TableRow key={sale.id}>
                        <TableCell>{dateOnly(sale.soldAt)}</TableCell>
                        <TableCell>{sale.branchNumber}</TableCell>
                        <TableCell>{sale.channel}</TableCell>
                        <TableCell>
                          {sale.taxInvoiceType} {sale.taxInvoiceNumber}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {amount(sale.amountIncludingVat)}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {amount(sale.vatAmount)}
                        </TableCell>
                        <TableCell>{sale.settlementStatus}</TableCell>
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
