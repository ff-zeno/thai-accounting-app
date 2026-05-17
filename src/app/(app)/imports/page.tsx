import Link from "next/link";
import { AlertTriangle, PackageSearch } from "lucide-react";
import { getActiveOrgId } from "@/lib/utils/org-context";
import { getImportsWorkflowDashboard } from "@/lib/db/queries/imports";
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
import { createManualImportPacketAction } from "./actions";

async function submitImportPacket(formData: FormData) {
  "use server";
  await createManualImportPacketAction(formData);
}

function amount(value: string | null | undefined) {
  return Number(value ?? 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function packetLabel(packet: {
  id: string;
  importReference: string | null;
  customsDeclarationNumber: string | null;
}) {
  return packet.importReference ?? packet.customsDeclarationNumber ?? packet.id.slice(0, 8);
}

export default async function ImportsPage() {
  const orgId = await getActiveOrgId();
  const dashboard = orgId ? await getImportsWorkflowDashboard(orgId) : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Imports Control Tower
        </h1>
        <p className="text-sm text-muted-foreground">
          Import packets, customs declarations, broker charges, import VAT evidence, and payment trace.
        </p>
      </div>

      {!orgId || !dashboard ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-2 py-12 text-center">
            <PackageSearch className="size-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Select an organization to view import controls.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card className="border-amber-200 bg-amber-50 text-amber-950">
            <CardContent className="flex gap-3 py-4 text-sm">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <div>
                <p className="font-medium">Imports are v1 packet controls.</p>
                <p className="mt-1 text-amber-900">
                  Manual packets, broker charge classification, payment links, audit trail, and
                  finalize-to-inventory are testable. Open packet header edits, empty-packet
                  deletion, child-line deletion, and document unlinking are available. Direct-clear
                  customs depth, historical backfill/reversal tooling, and richer picker UX remain
                  deferred.
                </p>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Open Packets</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold">
                  {dashboard.summary.openCount}
                </div>
                <p className="text-xs text-muted-foreground">
                  {dashboard.summary.finalizedCount} finalized.
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Assessed Import VAT</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold">
                  {amount(dashboard.summary.assessedImportVat)}
                </div>
                <p className="text-xs text-muted-foreground">
                  From customs declarations.
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Duty / Pass-through</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold">
                  {amount(dashboard.summary.assessedDuty)}
                </div>
                <p className="text-xs text-muted-foreground">
                  Broker pass-through lines {amount(dashboard.chargeSummary.passThroughCharges)}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Broker VAT Lines</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold">
                  {amount(dashboard.chargeSummary.importVatLines)}
                </div>
                <p className="text-xs text-muted-foreground">
                  Service VAT {amount(dashboard.chargeSummary.serviceVat)}
                </p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>New Import Packet</CardTitle>
            </CardHeader>
            <CardContent>
              <form action={submitImportPacket} className="grid gap-4 md:grid-cols-4">
                <div className="space-y-2">
                  <Label htmlFor="importReference">Import reference</Label>
                  <Input id="importReference" name="importReference" placeholder="JP-2026-001" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="customsDeclarationNumber">Customs declaration</Label>
                  <Input id="customsDeclarationNumber" name="customsDeclarationNumber" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="arrivalPort">Arrival port</Label>
                  <Input id="arrivalPort" name="arrivalPort" placeholder="Laem Chabang" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="originalCurrency">Currency</Label>
                  <Input id="originalCurrency" name="originalCurrency" defaultValue="JPY" maxLength={3} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="arrivalDate">Arrival date</Label>
                  <Input id="arrivalDate" name="arrivalDate" type="date" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="customsClearanceDate">Customs clearance</Label>
                  <Input id="customsClearanceDate" name="customsClearanceDate" type="date" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="fxRateAtClearance">FX at clearance</Label>
                  <Input id="fxRateAtClearance" name="fxRateAtClearance" inputMode="decimal" placeholder="0.23500000" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="customsAssessedDutyThb">Duty THB</Label>
                  <Input id="customsAssessedDutyThb" name="customsAssessedDutyThb" inputMode="decimal" defaultValue="0.00" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="customsAssessedExciseThb">Excise THB</Label>
                  <Input id="customsAssessedExciseThb" name="customsAssessedExciseThb" inputMode="decimal" defaultValue="0.00" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="customsAssessedImportVatThb">Import VAT THB</Label>
                  <Input id="customsAssessedImportVatThb" name="customsAssessedImportVatThb" inputMode="decimal" defaultValue="0.00" />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="notes">Notes</Label>
                  <Input id="notes" name="notes" />
                </div>
                <div className="md:col-span-4">
                  <Button type="submit">Create Packet</Button>
                </div>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Open Import Aging</CardTitle>
            </CardHeader>
            <CardContent>
              {dashboard.openAgingPackets.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  No open import packets need follow-up.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Reference</TableHead>
                      <TableHead>Clearance</TableHead>
                      <TableHead>Supplier</TableHead>
                      <TableHead className="text-right">Days open</TableHead>
                      <TableHead className="text-right">Docs</TableHead>
                      <TableHead className="text-right">Charges</TableHead>
                      <TableHead className="text-right">Payments</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dashboard.openAgingPackets.map((packet) => (
                      <TableRow key={packet.id}>
                        <TableCell>
                          <Link className="font-medium underline-offset-4 hover:underline" href={`/imports/${packet.id}`}>
                            {packetLabel(packet)}
                          </Link>
                        </TableCell>
                        <TableCell>{packet.customsClearanceDate}</TableCell>
                        <TableCell>{packet.supplierName ?? "-"}</TableCell>
                        <TableCell className="text-right font-mono">
                          {packet.daysOpen}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {packet.linkedDocumentCount}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {packet.brokerChargeLineCount}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {packet.paymentCount}
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
              <CardTitle>Recent Import Packets</CardTitle>
            </CardHeader>
            <CardContent>
              {dashboard.recentPackets.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  No import packets recorded yet.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Reference</TableHead>
                      <TableHead>Clearance</TableHead>
                      <TableHead>Branch</TableHead>
                      <TableHead>Currency</TableHead>
                      <TableHead className="text-right">Duty</TableHead>
                      <TableHead className="text-right">Import VAT</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dashboard.recentPackets.map((packet) => (
                      <TableRow key={packet.id}>
                        <TableCell>
                          <Link className="font-medium underline-offset-4 hover:underline" href={`/imports/${packet.id}`}>
                            {packetLabel(packet)}
                          </Link>
                        </TableCell>
                        <TableCell>{packet.customsClearanceDate}</TableCell>
                        <TableCell>{packet.branchNumber}</TableCell>
                        <TableCell>
                          {packet.originalCurrency} @ {packet.fxRateAtClearance}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {amount(packet.customsAssessedDutyThb)}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {amount(packet.customsAssessedImportVatThb)}
                        </TableCell>
                        <TableCell>{packet.isFinalized ? "finalized" : "open"}</TableCell>
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
