import { Landmark } from "lucide-react";
import { getActiveOrgId } from "@/lib/utils/org-context";
import { getCitDashboard } from "@/lib/db/queries/cit-filings";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  acceptCitFilingAction,
  buildActualH1Pnd51DraftAction,
  buildGlPnd50DraftAction,
  buildPnd50DraftAction,
  buildProjectedPnd51DraftAction,
  buildTransferPricingDisclosureDraftAction,
  postCitAccrualAction,
  postCitPaymentAction,
  refreshTransferPricingRequirementAction,
  recordBookTaxAdjustmentAction,
  expireLossCarryForwardLayersAction,
  recordLossCarryForwardLayerAction,
  submitCitFilingAction,
  submitTransferPricingDisclosureAction,
  syncEntertainmentExpenseBookTaxAdjustmentAction,
  syncFixedAssetDepreciationBookTaxAdjustmentAction,
} from "./actions";

async function submitPnd51(formData: FormData) {
  "use server";
  await buildProjectedPnd51DraftAction(formData);
}

async function submitActualH1Pnd51(formData: FormData) {
  "use server";
  await buildActualH1Pnd51DraftAction(formData);
}

async function submitPnd50(formData: FormData) {
  "use server";
  await buildPnd50DraftAction(formData);
}

async function submitGlPnd50(formData: FormData) {
  "use server";
  await buildGlPnd50DraftAction(formData);
}

async function submitCitAccrual(formData: FormData) {
  "use server";
  await postCitAccrualAction(formData);
}

async function submitCitPayment(formData: FormData) {
  "use server";
  await postCitPaymentAction(formData);
}

async function submitTransferPricingRefresh(formData: FormData) {
  "use server";
  await refreshTransferPricingRequirementAction(formData);
}

async function submitTransferPricingDisclosure(formData: FormData) {
  "use server";
  await buildTransferPricingDisclosureDraftAction(formData);
}

async function submitTransferPricingDisclosureForm(formData: FormData) {
  "use server";
  await submitTransferPricingDisclosureAction(formData);
}

async function submitBookTaxAdjustment(formData: FormData) {
  "use server";
  await recordBookTaxAdjustmentAction(formData);
}

async function submitEntertainmentAddbackSync(formData: FormData) {
  "use server";
  await syncEntertainmentExpenseBookTaxAdjustmentAction(formData);
}

async function submitCitFilingForm(formData: FormData) {
  "use server";
  await submitCitFilingAction(formData);
}

async function acceptCitFilingForm(formData: FormData) {
  "use server";
  await acceptCitFilingAction(formData);
}

async function submitLossLayer(formData: FormData) {
  "use server";
  await recordLossCarryForwardLayerAction(formData);
}

async function submitLossLayerExpiry(formData: FormData) {
  "use server";
  await expireLossCarryForwardLayersAction(formData);
}

async function submitDepreciationAdjustmentSync(formData: FormData) {
  "use server";
  await syncFixedAssetDepreciationBookTaxAdjustmentAction(formData);
}

function amount(value: string | null | undefined) {
  return Number(value ?? 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function lossLayerDisclosure(payload: unknown) {
  if (!Array.isArray(payload) || payload.length === 0) {
    return <span className="text-muted-foreground">-</span>;
  }

  const rows = payload
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      const originatedTaxYear =
        typeof row.originatedTaxYear === "number"
          ? row.originatedTaxYear
          : Number(row.originatedTaxYear);
      const consumedAmount =
        typeof row.consumedAmount === "string" ? row.consumedAmount : null;
      const remainingAmountAfter =
        typeof row.remainingAmountAfter === "string"
          ? row.remainingAmountAfter
          : null;

      if (!Number.isFinite(originatedTaxYear) || !consumedAmount || !remainingAmountAfter) {
        return null;
      }

      return {
        originatedTaxYear,
        consumedAmount,
        remainingAmountAfter,
      };
    })
    .filter((row): row is {
      originatedTaxYear: number;
      consumedAmount: string;
      remainingAmountAfter: string;
    } => Boolean(row));

  if (rows.length === 0) {
    return <span className="text-muted-foreground">-</span>;
  }

  return (
    <div className="space-y-1 text-xs">
      {rows.map((row) => (
        <div key={`${row.originatedTaxYear}-${row.consumedAmount}`}>
          {row.originatedTaxYear}: used {amount(row.consumedAmount)}, remaining{" "}
          {amount(row.remainingAmountAfter)}
        </div>
      ))}
    </div>
  );
}

export default async function CitPage() {
  const orgId = await getActiveOrgId();
  const dashboard = orgId ? await getCitDashboard(orgId) : null;
  const year = new Date().getUTCFullYear();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">CIT Workbench</h1>
        <p className="text-sm text-muted-foreground">
          PND.51 projected-profit draft surface and CIT filing working-paper foundation.
        </p>
      </div>

      <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-800">
        DBD/TFRS financial statements, notes, Builder packet, and auditor ZIP are
        not generated yet. Phase 12b remains blocked until CPA review and
        authenticated DBD Builder validation confirm the current schema and template.
      </div>
      <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-800">
        CIT is working-paper v1. PND.51/PND.50 drafts, loss layers, manual
        book-tax adjustments, WHT credits, CIT accrual/payment posting, and
        transfer-pricing threshold flagging are testable. Richer book-tax
        adjustment catalog automation and exact RD transfer-pricing form
        rendering/submission remain deferred.
      </div>

      {!orgId || !dashboard ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-2 py-12 text-center">
            <Landmark className="size-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Select an organization to view CIT controls.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardHeader><CardTitle className="text-sm">Drafts</CardTitle></CardHeader>
              <CardContent><div className="text-2xl font-semibold">{dashboard.summary.draftCount}</div></CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-sm">Submitted</CardTitle></CardHeader>
              <CardContent><div className="text-2xl font-semibold">{dashboard.summary.submittedCount}</div></CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-sm">Accepted</CardTitle></CardHeader>
              <CardContent><div className="text-2xl font-semibold">{dashboard.summary.acceptedCount}</div></CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-sm">CIT Payable</CardTitle></CardHeader>
              <CardContent><div className="text-2xl font-semibold">{amount(dashboard.summary.citPayable)}</div></CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader><CardTitle>Projected PND.51 Draft</CardTitle></CardHeader>
            <CardContent>
              <form action={submitPnd51} className="grid gap-4 md:grid-cols-4">
                <div className="space-y-2">
                  <Label htmlFor="taxYear">Tax year</Label>
                  <Input id="taxYear" name="taxYear" inputMode="numeric" defaultValue={year} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="entityType">Entity type</Label>
                  <select
                    id="entityType"
                    name="entityType"
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                    defaultValue="standard"
                  >
                    <option value="standard">Standard 20%</option>
                    <option value="sme_qualifying">SME qualifying tiered</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="projectedFullYearProfit">Projected full-year profit</Label>
                  <Input id="projectedFullYearProfit" name="projectedFullYearProfit" inputMode="decimal" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="rationale">Rationale</Label>
                  <Input id="rationale" name="rationale" />
                </div>
                <div className="md:col-span-4">
                  <Button type="submit">Build PND.51 Draft</Button>
                </div>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Actual H1 PND.51 Draft</CardTitle></CardHeader>
            <CardContent>
              <form action={submitActualH1Pnd51} className="grid gap-4 md:grid-cols-4">
                <div className="space-y-2">
                  <Label htmlFor="h1TaxYear">Tax year</Label>
                  <Input id="h1TaxYear" name="taxYear" inputMode="numeric" defaultValue={year} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="h1EntityType">Entity type</Label>
                  <select
                    id="h1EntityType"
                    name="entityType"
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                    defaultValue="standard"
                  >
                    <option value="standard">Standard 20%</option>
                    <option value="sme_qualifying">SME qualifying tiered</option>
                  </select>
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="h1Rationale">Rationale</Label>
                  <Input id="h1Rationale" name="rationale" />
                </div>
                <div className="md:col-span-4">
                  <Button type="submit" variant="outline">
                    Build Actual H1 PND.51 Draft
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Annual PND.50 Draft</CardTitle></CardHeader>
            <CardContent>
              <form action={submitPnd50} className="grid gap-4 md:grid-cols-4">
                <div className="space-y-2">
                  <Label htmlFor="pnd50TaxYear">Tax year</Label>
                  <Input id="pnd50TaxYear" name="taxYear" inputMode="numeric" defaultValue={year - 1} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pnd50EntityType">Entity type</Label>
                  <select
                    id="pnd50EntityType"
                    name="entityType"
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                    defaultValue="standard"
                  >
                    <option value="standard">Standard 20%</option>
                    <option value="sme_qualifying">SME qualifying tiered</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="accountingProfit">Accounting profit</Label>
                  <Input id="accountingProfit" name="accountingProfit" inputMode="decimal" required />
                </div>
                <div className="flex items-end">
                  <Button type="submit">Build PND.50 Draft</Button>
                </div>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>GL PND.50 Draft</CardTitle></CardHeader>
            <CardContent>
              <form action={submitGlPnd50} className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="glPnd50TaxYear">Tax year</Label>
                  <Input id="glPnd50TaxYear" name="taxYear" inputMode="numeric" defaultValue={year - 1} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="glPnd50EntityType">Entity type</Label>
                  <select
                    id="glPnd50EntityType"
                    name="entityType"
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                    defaultValue="standard"
                  >
                    <option value="standard">Standard 20%</option>
                    <option value="sme_qualifying">SME qualifying tiered</option>
                  </select>
                </div>
                <div className="flex items-end">
                  <Button type="submit" variant="outline">
                    Build GL PND.50 Draft
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Transfer Pricing</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="text-2xl font-semibold">
                {dashboard.transferPricingRequired ? "Required" : "Not required"}
              </div>
              <form action={submitTransferPricingRefresh} className="grid gap-4 md:grid-cols-[160px_auto]">
                <div className="space-y-2">
                  <Label htmlFor="tpTaxYear">Tax year</Label>
                  <Input id="tpTaxYear" name="taxYear" inputMode="numeric" defaultValue={year - 1} />
                </div>
                <div className="flex items-end">
                  <Button type="submit" variant="outline">
                    Refresh TP Flag
                  </Button>
                </div>
              </form>
              <form
                action={submitTransferPricingDisclosure}
                className="grid gap-4 md:grid-cols-4"
              >
                <div className="space-y-2">
                  <Label htmlFor="tpDisclosureYear">Tax year</Label>
                  <Input
                    id="tpDisclosureYear"
                    name="taxYear"
                    inputMode="numeric"
                    defaultValue={year - 1}
                  />
                </div>
                <div className="space-y-2 md:col-span-3">
                  <Label htmlFor="tpRelatedParties">Related-party transactions</Label>
                  <Textarea
                    id="tpRelatedParties"
                    name="relatedPartyTransactionsText"
                    rows={4}
                  />
                </div>
                <div className="space-y-2 md:col-span-4">
                  <Label htmlFor="tpNotes">Notes</Label>
                  <Input id="tpNotes" name="notes" />
                </div>
                <div className="md:col-span-4">
                  <Button type="submit" variant="outline">
                    Build TP Disclosure
                  </Button>
                </div>
              </form>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Year</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Revenue</TableHead>
                    <TableHead>Required</TableHead>
                    <TableHead>Transactions</TableHead>
                    <TableHead>Submitted</TableHead>
                    <TableHead>Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dashboard.transferPricingDisclosures.map((disclosure) => (
                    <TableRow key={disclosure.id}>
                      <TableCell>{disclosure.taxYear}</TableCell>
                      <TableCell>{disclosure.status}</TableCell>
                      <TableCell>{amount(disclosure.revenueTotal)}</TableCell>
                      <TableCell>
                        {disclosure.disclosureRequired ? "Required" : "Not required"}
                      </TableCell>
                      <TableCell>
                        {Array.isArray(disclosure.relatedPartyTransactionsPayload)
                          ? disclosure.relatedPartyTransactionsPayload.length
                          : 0}
                      </TableCell>
                      <TableCell>
                        {disclosure.submittedAt
                          ? disclosure.submittedAt.toISOString().slice(0, 10)
                          : "-"}
                      </TableCell>
                      <TableCell>
                        {disclosure.status === "draft" ? (
                          <form action={submitTransferPricingDisclosureForm}>
                            <input
                              type="hidden"
                              name="disclosureId"
                              value={disclosure.id}
                            />
                            <Button type="submit" size="sm" variant="outline">
                              Submit TP
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
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Loss Carry-forward Layer</CardTitle></CardHeader>
            <CardContent>
              <form action={submitLossLayer} className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="originatedTaxYear">Origin year</Label>
                  <Input id="originatedTaxYear" name="originatedTaxYear" inputMode="numeric" defaultValue={year - 1} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="originalAmount">Tax loss amount</Label>
                  <Input id="originalAmount" name="originalAmount" inputMode="decimal" required />
                </div>
                <div className="self-end">
                  <Button type="submit">Record Loss Layer</Button>
                </div>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Book-tax Adjustments</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <form action={submitBookTaxAdjustment} className="grid gap-4 md:grid-cols-5">
                <div className="space-y-2">
                  <Label htmlFor="bookTaxYear">Tax year</Label>
                  <Input id="bookTaxYear" name="taxYear" inputMode="numeric" defaultValue={year - 1} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="bookTaxCategory">Category</Label>
                  <select
                    id="bookTaxCategory"
                    name="category"
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                    defaultValue="non_deductible_expense"
                  >
                    <option value="non_deductible_expense">Non-deductible expense</option>
                    <option value="entertainment_50pct_disallowance">Entertainment 50%</option>
                    <option value="entertainment_cap_excess">Entertainment cap excess</option>
                    <option value="donation_2pct_limit">Donation limit</option>
                    <option value="boi_exempt_revenue">BOI exempt revenue</option>
                    <option value="provision_disallowance">Provision disallowance</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="bookTaxDirection">Direction</Label>
                  <select
                    id="bookTaxDirection"
                    name="direction"
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                    defaultValue="add_back"
                  >
                    <option value="add_back">Add back</option>
                    <option value="deduct">Deduct</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="bookTaxAmount">Amount</Label>
                  <Input id="bookTaxAmount" name="amount" inputMode="decimal" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="bookTaxDescription">Description</Label>
                  <Input id="bookTaxDescription" name="description" required />
                </div>
                <div className="md:col-span-5">
                  <Button type="submit" variant="outline">
                    Record Adjustment
                  </Button>
                </div>
              </form>
              <form
                action={submitEntertainmentAddbackSync}
                className="grid gap-4 md:grid-cols-[160px_auto]"
              >
                <div className="space-y-2">
                  <Label htmlFor="entertainmentTaxYear">Tax year</Label>
                  <Input
                    id="entertainmentTaxYear"
                    name="taxYear"
                    inputMode="numeric"
                    defaultValue={year - 1}
                  />
                </div>
                <div className="flex items-end">
                  <Button type="submit" variant="outline">
                    Sync Entertainment Addback
                  </Button>
                </div>
              </form>
              <form
                action={submitDepreciationAdjustmentSync}
                className="grid gap-4 md:grid-cols-[160px_auto]"
              >
                <div className="space-y-2">
                  <Label htmlFor="adjustmentTaxYear">Tax year</Label>
                  <Input
                    id="adjustmentTaxYear"
                    name="taxYear"
                    inputMode="numeric"
                    defaultValue={year}
                  />
                </div>
                <div className="flex items-end">
                  <Button type="submit" variant="outline">
                    Sync Depreciation Addback
                  </Button>
                </div>
              </form>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Year</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Direction</TableHead>
                    <TableHead>Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dashboard.bookTaxAdjustments.map((adjustment) => (
                    <TableRow key={adjustment.id}>
                      <TableCell>{adjustment.taxYear}</TableCell>
                      <TableCell>{adjustment.category.replaceAll("_", " ")}</TableCell>
                      <TableCell>{adjustment.direction.replaceAll("_", " ")}</TableCell>
                      <TableCell>{amount(adjustment.amount)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>CIT Filings</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Year</TableHead>
                    <TableHead>Form</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Taxable income</TableHead>
                    <TableHead>Losses used</TableHead>
                    <TableHead>Loss disclosure</TableHead>
                    <TableHead>CIT calculated</TableHead>
                    <TableHead>WHT credits</TableHead>
                    <TableHead>Payable</TableHead>
                    <TableHead>Accrual</TableHead>
                    <TableHead>Submit</TableHead>
                    <TableHead>Accept</TableHead>
                    <TableHead>Payment</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dashboard.recentFilings.map((filing) => (
                    <TableRow key={filing.id}>
                      <TableCell>{filing.taxYear}</TableCell>
                      <TableCell>{filing.filingType.toUpperCase()}</TableCell>
                      <TableCell>{filing.filingStatus}</TableCell>
                      <TableCell>{amount(filing.taxableIncome)}</TableCell>
                      <TableCell>{amount(filing.lossesConsumedThisYear)}</TableCell>
                      <TableCell>
                        {lossLayerDisclosure(filing.lossCarryForwardConsumptionPayload)}
                      </TableCell>
                      <TableCell>{amount(filing.citCalculated)}</TableCell>
                      <TableCell>{amount(filing.whtCreditsUsed)}</TableCell>
                      <TableCell>{amount(filing.citPayable)}</TableCell>
                      <TableCell>
                        {filing.filingType === "pnd50" && Number(filing.citPayable ?? 0) > 0 ? (
                          <form action={submitCitAccrual}>
                            <input type="hidden" name="citFilingId" value={filing.id} />
                            <Button type="submit" size="sm" variant="outline">
                              Post accrual
                            </Button>
                          </form>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {filing.filingStatus === "submitted" ? (
                          <form action={acceptCitFilingForm}>
                            <input type="hidden" name="filingId" value={filing.id} />
                            <Button type="submit" size="sm" variant="outline">
                              Accept
                            </Button>
                          </form>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {filing.filingStatus === "draft" ? (
                          <form action={submitCitFilingForm} className="flex gap-2">
                            <input type="hidden" name="filingId" value={filing.id} />
                            <Input
                              name="rdReferenceNumber"
                              placeholder="RD ref"
                              className="h-8 w-28"
                            />
                            <Button type="submit" size="sm" variant="outline">
                              Submit
                            </Button>
                          </form>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {filing.filingStatus !== "draft" &&
                        !filing.paidAt &&
                        Number(filing.citPayable ?? 0) > 0 ? (
                          <form action={submitCitPayment}>
                            <input type="hidden" name="citFilingId" value={filing.id} />
                            <Button type="submit" size="sm" variant="outline">
                              Post payment
                            </Button>
                          </form>
                        ) : (
                          <span className="text-muted-foreground">
                            {filing.paidAt ? "Paid" : "-"}
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Loss Carry-forward Layers</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <form action={submitLossLayerExpiry} className="grid gap-3 md:grid-cols-[180px_auto] md:items-end">
                <div className="space-y-2">
                  <Label htmlFor="lossExpiryTaxYear">Expire before tax year</Label>
                  <Input
                    id="lossExpiryTaxYear"
                    name="taxYear"
                    inputMode="numeric"
                    defaultValue={year - 1}
                  />
                </div>
                <Button type="submit" variant="outline">Expire Old Layers</Button>
              </form>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Origin year</TableHead>
                    <TableHead>Expiry year</TableHead>
                    <TableHead>Original loss</TableHead>
                    <TableHead>Remaining</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dashboard.lossLayers.map((layer) => (
                    <TableRow key={layer.id}>
                      <TableCell>{layer.originatedTaxYear}</TableCell>
                      <TableCell>{layer.expiryTaxYear}</TableCell>
                      <TableCell>{amount(layer.originalAmount)}</TableCell>
                      <TableCell>{amount(layer.remainingAmount)}</TableCell>
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
