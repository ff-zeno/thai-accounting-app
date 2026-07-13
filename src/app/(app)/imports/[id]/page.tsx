import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, CircleAlert, CircleCheck } from "lucide-react";
import { getActiveOrgId } from "@/lib/utils/org-context";
import { getImportPacketDetail } from "@/lib/db/queries/imports";
import { formatAmount } from "@/lib/utils/money";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Amount } from "@/components/ui/amount";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { StatusBadge } from "@/components/status-badge";
import { DeleteLineButton } from "../delete-line-button";
import {
  addImportGoodsLineAction,
  addManualImportChargeLineAction,
  addManualImportVatChargeLineAction,
  deleteEmptyOpenImportPacketAction,
  deleteOpenImportChargeLineAction,
  deleteOpenImportDocumentLinkAction,
  deleteOpenImportGoodsLineAction,
  deleteOpenImportPaymentLinkAction,
  finalizeImportPacketAction,
  linkImportDocumentAction,
  linkImportPaymentAction,
  updateOpenImportPacketHeaderAction,
} from "../actions";

async function submitGoodsLine(formData: FormData) {
  "use server";
  await redirectActionResult(formData, addImportGoodsLineAction(formData));
}

async function submitImportVatLine(formData: FormData) {
  "use server";
  await redirectActionResult(formData, addManualImportVatChargeLineAction(formData));
}

async function submitChargeLine(formData: FormData) {
  "use server";
  await redirectActionResult(formData, addManualImportChargeLineAction(formData));
}

async function submitFinalize(formData: FormData) {
  "use server";
  await redirectActionResult(formData, finalizeImportPacketAction(formData));
}

async function submitDocumentLink(formData: FormData) {
  "use server";
  await redirectActionResult(formData, linkImportDocumentAction(formData));
}

async function submitHeaderUpdate(formData: FormData) {
  "use server";
  await redirectActionResult(formData, updateOpenImportPacketHeaderAction(formData));
}

async function submitDeletePacket(formData: FormData) {
  "use server";
  const result = await deleteEmptyOpenImportPacketAction(formData);
  if (result?.error) {
    const importId = String(formData.get("importId") ?? "").trim();
    redirect(`/imports/${importId}?error=${encodeURIComponent(result.error)}`);
  }
  redirect("/imports?status=deleted");
}

async function submitDeleteGoodsLine(formData: FormData) {
  "use server";
  await redirectActionResult(formData, deleteOpenImportGoodsLineAction(formData));
}

async function submitDeleteChargeLine(formData: FormData) {
  "use server";
  await redirectActionResult(formData, deleteOpenImportChargeLineAction(formData));
}

async function submitDeleteDocumentLink(formData: FormData) {
  "use server";
  await redirectActionResult(formData, deleteOpenImportDocumentLinkAction(formData));
}

async function submitDeletePaymentLink(formData: FormData) {
  "use server";
  await redirectActionResult(formData, deleteOpenImportPaymentLinkAction(formData));
}

async function submitPaymentLink(formData: FormData) {
  "use server";
  await redirectActionResult(formData, linkImportPaymentAction(formData));
}

async function redirectActionResult(
  formData: FormData,
  resultPromise: Promise<{ error?: string } | undefined>
) {
  "use server";
  const importId = String(formData.get("importId") ?? "").trim();
  const result = await resultPromise;
  if (result?.error) {
    redirect(`/imports/${importId}?error=${encodeURIComponent(result.error)}`);
  }
  redirect(`/imports/${importId}?status=updated`);
}

export default async function ImportDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ error?: string; status?: string }>;
}) {
  const orgId = await getActiveOrgId();
  if (!orgId) notFound();

  const { id } = await params;
  const messages = searchParams ? await searchParams : {};
  const detail = await getImportPacketDetail(orgId, id);
  if (!detail) notFound();

  const { packet } = detail;
  const importVatTotal = detail.chargeLines
    .filter((line) => line.vatTreatment === "is_import_vat")
    .reduce((sum, line) => sum + Number(line.amountThb), 0);
  const importVatMatchesAssessment =
    importVatTotal.toFixed(2) === Number(packet.customsAssessedImportVatThb).toFixed(2);
  const canFinalize = detail.goodsLines.length > 0 && importVatMatchesAssessment;
  const isEmptyOpenPacket =
    !packet.isFinalized &&
    detail.goodsLines.length === 0 &&
    detail.chargeLines.length === 0 &&
    detail.documents.length === 0 &&
    detail.payments.length === 0;

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/imports"
          className="mb-2 inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="mr-2 size-4" />
          Imports
        </Link>
        <PageHeader
          title={
            packet.importReference ?? packet.customsDeclarationNumber ?? "Import Packet"
          }
          description={
            <>
              Customs clearance {packet.customsClearanceDate} ·{" "}
              <StatusBadge status={packet.isFinalized ? "finalized" : "open"} />
            </>
          }
        />
      </div>

      {messages.error ? (
        <Alert variant="destructive">
          <CircleAlert />
          <AlertDescription>{messages.error}</AlertDescription>
        </Alert>
      ) : null}
      {messages.status ? (
        <Alert variant="success">
          <CircleCheck />
          <AlertDescription>Import packet updated.</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-4 md:grid-cols-4">
        <StatCard
          label="Customs Declaration"
          value={packet.customsDeclarationNumber ?? "Not linked"}
        />
        <StatCard
          label="Currency / FX"
          value={`${packet.originalCurrency} @ ${packet.fxRateAtClearance}`}
        />
        <StatCard
          label="Assessed Duty"
          value={<Amount value={packet.customsAssessedDutyThb} />}
        />
        <StatCard
          label="Import VAT"
          value={<Amount value={packet.customsAssessedImportVatThb} />}
        />
      </div>

      {!packet.isFinalized ? (
        <Card>
          <CardHeader>
            <CardTitle>Edit Packet Header</CardTitle>
          </CardHeader>
          <CardContent>
            <form action={submitHeaderUpdate} className="grid gap-4 md:grid-cols-4">
              <input type="hidden" name="importId" value={packet.id} />
              <div className="space-y-2">
                <Label htmlFor="editImportReference">Reference</Label>
                <Input
                  id="editImportReference"
                  name="importReference"
                  defaultValue={packet.importReference ?? ""}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="editCustomsDeclarationNumber">Customs declaration</Label>
                <Input
                  id="editCustomsDeclarationNumber"
                  name="customsDeclarationNumber"
                  defaultValue={packet.customsDeclarationNumber ?? ""}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="editArrivalPort">Arrival port</Label>
                <Input
                  id="editArrivalPort"
                  name="arrivalPort"
                  defaultValue={packet.arrivalPort ?? ""}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="editNotes">Notes</Label>
                <Input id="editNotes" name="notes" defaultValue={packet.notes ?? ""} />
              </div>
              <div className="md:col-span-4">
                <Button type="submit">Save Header</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Goods Lines</CardTitle>
        </CardHeader>
        <CardContent>
          {!packet.isFinalized ? (
            <form action={submitGoodsLine} className="mb-6 grid gap-4 md:grid-cols-5">
              <input type="hidden" name="importId" value={packet.id} />
              <div className="space-y-2">
                <Label htmlFor="skuCode">SKU</Label>
                <Input id="skuCode" name="skuCode" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Input id="description" name="description" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="quantity">Qty</Label>
                <Input id="quantity" name="quantity" inputMode="decimal" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="unitPriceOriginal">Unit price</Label>
                <Input id="unitPriceOriginal" name="unitPriceOriginal" inputMode="decimal" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="goodsValueThb">THB value</Label>
                <Input id="goodsValueThb" name="goodsValueThb" inputMode="decimal" required />
              </div>
              <input type="hidden" name="goodsValueOriginal" value="0.00" />
              <div className="md:col-span-5">
                <Button type="submit">Add Goods Line</Button>
              </div>
            </form>
          ) : null}

          {detail.goodsLines.length === 0 ? (
            <EmptyState size="sm" title="No goods lines linked yet." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>SKU</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">Original value</TableHead>
                  <TableHead className="text-right">THB value</TableHead>
                  <TableHead>Lot</TableHead>
                  {!packet.isFinalized ? <TableHead className="text-right">Action</TableHead> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {detail.goodsLines.map((line) => (
                  <TableRow key={line.id}>
                    <TableCell>{line.skuCode}</TableCell>
                    <TableCell className="text-right tabular-nums">{line.quantity}</TableCell>
                    <TableCell className="text-right">
                      <Amount value={line.goodsValueOriginal} />
                    </TableCell>
                    <TableCell className="text-right">
                      <Amount value={line.goodsValueThb} />
                    </TableCell>
                    <TableCell>{line.lotSequence}</TableCell>
                    {!packet.isFinalized ? (
                      <TableCell className="text-right">
                        <form action={submitDeleteGoodsLine}>
                          <input type="hidden" name="importId" value={packet.id} />
                          <input type="hidden" name="goodsLineId" value={line.id} />
                          <DeleteLineButton
                            label="Delete Goods Line"
                            message={`Delete goods line ${line.skuCode}?`}
                          />
                        </form>
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Charge Lines</CardTitle>
        </CardHeader>
        <CardContent>
          {!packet.isFinalized ? (
            <div className="mb-6 space-y-6">
              <form action={submitImportVatLine} className="grid gap-4 md:grid-cols-4">
                <input type="hidden" name="importId" value={packet.id} />
                <input
                  type="hidden"
                  name="customsClearanceDate"
                  value={packet.customsClearanceDate}
                />
                <div className="space-y-2">
                  <Label htmlFor="importVatDocumentNumber">Evidence no.</Label>
                  <Input id="importVatDocumentNumber" name="documentNumber" placeholder="Customs receipt" />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="importVatLineDescription">Description</Label>
                  <Input id="importVatLineDescription" name="lineDescription" defaultValue="Customs import VAT" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="importVatAmountThb">Import VAT THB</Label>
                  <Input id="importVatAmountThb" name="amountThb" inputMode="decimal" required />
                </div>
                <div className="md:col-span-4">
                  <Button type="submit">Add Import VAT Line</Button>
                </div>
              </form>
              <form action={submitChargeLine} className="grid gap-4 md:grid-cols-4">
                <input type="hidden" name="importId" value={packet.id} />
                <input type="hidden" name="documentRole" value="broker_invoice" />
                <div className="space-y-2">
                  <Label htmlFor="chargeDocumentNumber">Broker invoice no.</Label>
                  <Input id="chargeDocumentNumber" name="documentNumber" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="chargeLineDescription">Charge description</Label>
                  <Input id="chargeLineDescription" name="lineDescription" defaultValue="Broker service fee" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="vatTreatment">Treatment</Label>
                  <NativeSelect
                    id="vatTreatment"
                    name="vatTreatment"
                    className="w-full"
                    defaultValue="service_with_vat_pct"
                  >
                    <option value="service_with_vat_pct">Service with VAT</option>
                    <option value="service_with_vat_zero">Zero-rated service</option>
                    <option value="service_vat_exempt">VAT-exempt service</option>
                    <option value="is_pass_through">Pass-through</option>
                    <option value="excise_pass_through">Excise pass-through</option>
                  </NativeSelect>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="chargeAmountThb">Amount THB</Label>
                  <Input id="chargeAmountThb" name="amountThb" inputMode="decimal" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="vatAmountThb">Service VAT THB</Label>
                  <Input id="vatAmountThb" name="vatAmountThb" inputMode="decimal" defaultValue="0.00" />
                </div>
                <div className="flex items-end md:col-span-3">
                  <Button type="submit">Add Broker Charge</Button>
                </div>
              </form>
            </div>
          ) : null}

          {detail.chargeLines.length === 0 ? (
            <EmptyState
              size="sm"
              title="No broker or customs charge lines linked yet."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Description</TableHead>
                  <TableHead>Treatment</TableHead>
                  <TableHead>VAT period</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">VAT</TableHead>
                  {!packet.isFinalized ? <TableHead className="text-right">Action</TableHead> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {detail.chargeLines.map((line) => (
                  <TableRow key={line.id}>
                    <TableCell>{line.lineDescription}</TableCell>
                    <TableCell>{line.vatTreatment}</TableCell>
                    <TableCell>{line.vatPeriodOverride ?? "document period"}</TableCell>
                    <TableCell className="text-right">
                      <Amount value={line.amountThb} />
                    </TableCell>
                    <TableCell className="text-right">
                      <Amount value={line.vatAmountThb} />
                    </TableCell>
                    {!packet.isFinalized ? (
                      <TableCell className="text-right">
                        <form action={submitDeleteChargeLine}>
                          <input type="hidden" name="importId" value={packet.id} />
                          <input type="hidden" name="chargeLineId" value={line.id} />
                          <DeleteLineButton
                            label="Delete Charge Line"
                            message={`Delete charge line ${line.lineDescription}?`}
                          />
                        </form>
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Linked Documents</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {!packet.isFinalized ? (
              <form action={submitDocumentLink} className="grid gap-4 md:grid-cols-2">
                <input type="hidden" name="importId" value={packet.id} />
                <div className="space-y-2">
                  <Label htmlFor="documentRole">Role</Label>
                  <NativeSelect
                    id="documentRole"
                    name="documentRole"
                    className="w-full"
                    defaultValue="foreign_supplier_invoice"
                  >
                    <option value="foreign_supplier_invoice">Supplier invoice</option>
                    <option value="customs_declaration">Customs declaration</option>
                    <option value="broker_invoice">Broker invoice</option>
                    <option value="shipping_invoice">Shipping invoice</option>
                    <option value="bank_remittance_advice">Bank remittance advice</option>
                    <option value="other">Other</option>
                  </NativeSelect>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="documentNumber">Document no.</Label>
                  <Input id="documentNumber" name="documentNumber" />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="notes">Notes</Label>
                  <Input id="notes" name="notes" />
                </div>
                <div className="md:col-span-2">
                  <Button type="submit">Link Document</Button>
                </div>
              </form>
            ) : null}
            <div className="text-2xl font-semibold">{detail.documents.length}</div>
            {detail.documents.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Foreign invoice, customs declaration, broker bill, and evidence links.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Role</TableHead>
                    <TableHead>Notes</TableHead>
                    {!packet.isFinalized ? <TableHead className="text-right">Action</TableHead> : null}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detail.documents.map((doc) => (
                    <TableRow key={doc.id}>
                      <TableCell>{doc.documentRole}</TableCell>
                      <TableCell>{doc.notes}</TableCell>
                      {!packet.isFinalized ? (
                        <TableCell className="text-right">
                          <form action={submitDeleteDocumentLink}>
                            <input type="hidden" name="importId" value={packet.id} />
                            <input type="hidden" name="importDocumentId" value={doc.id} />
                            <DeleteLineButton
                              label="Unlink Document"
                              message={`Unlink ${doc.documentRole} from this import?`}
                            />
                          </form>
                        </TableCell>
                      ) : null}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Linked Payments</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {!packet.isFinalized ? (
              <form action={submitPaymentLink} className="grid gap-4 md:grid-cols-2">
                <input type="hidden" name="importId" value={packet.id} />
                <div className="space-y-2">
                  <Label htmlFor="paymentRole">Role</Label>
                  <NativeSelect
                    id="paymentRole"
                    name="paymentRole"
                    className="w-full"
                    defaultValue="broker_settlement"
                  >
                    <option value="foreign_supplier_payment">Supplier payment</option>
                    <option value="broker_settlement">Broker settlement</option>
                    <option value="shipper_settlement">Shipper settlement</option>
                    <option value="customs_direct_payment">Customs direct payment</option>
                  </NativeSelect>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="amountThb">Amount THB</Label>
                  <Input id="amountThb" name="amountThb" inputMode="decimal" required />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="bankTransactionId">Bank transaction</Label>
                  {detail.paymentCandidates.length > 0 ? (
                    <NativeSelect
                      id="bankTransactionId"
                      name="bankTransactionId"
                      className="w-full"
                      required
                    >
                      {detail.paymentCandidates.map((candidate) => (
                        <option key={candidate.id} value={candidate.id}>
                          {candidate.date} · {formatAmount(candidate.amount)} ·{" "}
                          {candidate.description ?? candidate.id.slice(0, 8)}
                        </option>
                      ))}
                    </NativeSelect>
                  ) : (
                    <p className="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
                      No unmatched debit bank transactions available.
                    </p>
                  )}
                </div>
                <div className="md:col-span-2">
                  <Button type="submit" disabled={detail.paymentCandidates.length === 0}>
                    Link Payment
                  </Button>
                </div>
              </form>
            ) : null}
            <div className="text-2xl font-semibold">{detail.payments.length}</div>
            {detail.payments.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Foreign supplier, broker, shipper, and customs payment trace.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Role</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Bank transaction</TableHead>
                    {!packet.isFinalized ? <TableHead className="text-right">Action</TableHead> : null}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detail.payments.map((payment) => (
                    <TableRow key={payment.id}>
                      <TableCell>{payment.paymentRole}</TableCell>
                      <TableCell className="text-right">
                        <Amount value={payment.amountThb} />
                      </TableCell>
                      <TableCell>{payment.bankTransactionId.slice(0, 8)}</TableCell>
                      {!packet.isFinalized ? (
                        <TableCell className="text-right">
                          <form action={submitDeletePaymentLink}>
                            <input type="hidden" name="importId" value={packet.id} />
                            <input type="hidden" name="importPaymentId" value={payment.id} />
                            <DeleteLineButton
                              label="Unlink Payment"
                              message={`Unlink ${payment.paymentRole} payment and reverse its GL entry?`}
                            />
                          </form>
                        </TableCell>
                      ) : null}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Import Audit Trail</CardTitle>
        </CardHeader>
        <CardContent>
          {detail.auditTrail.length === 0 ? (
            <EmptyState size="sm" title="No paper-trail events linked yet." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Label</TableHead>
                  <TableHead>Detail</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {detail.auditTrail.map((event) => (
                  <TableRow key={`${event.eventType}:${event.id}`}>
                    <TableCell>{event.occurredAt.toISOString().slice(0, 10)}</TableCell>
                    <TableCell>{event.eventType}</TableCell>
                    <TableCell>{event.label}</TableCell>
                    <TableCell>{event.detail}</TableCell>
                    <TableCell className="text-right">
                      {event.amount ? <Amount value={event.amount} /> : ""}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {!packet.isFinalized ? (
        <Card>
          <CardHeader>
            <CardTitle>Finalize</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between gap-4">
            <p className="text-sm text-muted-foreground">
              Creates goods-value-only inventory movements and locks the import packet.
              {!importVatMatchesAssessment
                ? " Import VAT lines must match the customs assessment first."
                : ""}
            </p>
            <form action={submitFinalize}>
              <input type="hidden" name="importId" value={packet.id} />
              <Button
                type="submit"
                disabled={!canFinalize}
              >
                Finalize to Inventory
              </Button>
            </form>
          </CardContent>
        </Card>
      ) : null}

      {isEmptyOpenPacket ? (
        <Card className="border-destructive/30">
          <CardHeader>
            <CardTitle>Delete Empty Packet</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between gap-4">
            <p className="text-sm text-muted-foreground">
              Removes this open packet because no goods, charges, documents, or payments are linked.
            </p>
            <form action={submitDeletePacket}>
              <input type="hidden" name="importId" value={packet.id} />
              <Button type="submit" variant="destructive">
                Delete Packet
              </Button>
            </form>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
