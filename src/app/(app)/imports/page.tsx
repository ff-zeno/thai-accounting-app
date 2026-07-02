import Link from "next/link";
import { AlertTriangle, PackageSearch } from "lucide-react";
import { getActiveOrgId } from "@/lib/utils/org-context";
import { getImportsWorkflowDashboard } from "@/lib/db/queries/imports";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Amount } from "@/components/ui/amount";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { StatusBadge } from "@/components/status-badge";
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
      <PageHeader
        title="Imports Control Tower"
        description="Import packets, customs declarations, broker charges, import VAT evidence, and payment trace."
      />

      {!orgId || !dashboard ? (
        <Card>
          <CardContent>
            <EmptyState
              icon={<PackageSearch />}
              title="Select an organization to view import controls."
            />
          </CardContent>
        </Card>
      ) : (
        <>
          <Alert variant="warning">
            <AlertTriangle />
            <AlertTitle>Imports are v1 packet controls.</AlertTitle>
            <AlertDescription>
              Manual packets, broker charge classification, payment links, audit trail, and
              finalize-to-inventory are testable. Open packet header edits, empty-packet
              deletion, child-line deletion, and document unlinking are available. Direct-clear
              customs depth, historical backfill/reversal tooling, and richer picker UX remain
              deferred.
            </AlertDescription>
          </Alert>

          <div className="grid gap-4 md:grid-cols-4">
            <StatCard
              label="Open Packets"
              value={dashboard.summary.openCount}
              hint={`${dashboard.summary.finalizedCount} finalized.`}
            />
            <StatCard
              label="Assessed Import VAT"
              value={<Amount value={dashboard.summary.assessedImportVat} />}
              hint="From customs declarations."
            />
            <StatCard
              label="Duty / Pass-through"
              value={<Amount value={dashboard.summary.assessedDuty} />}
              hint={
                <>
                  Broker pass-through lines{" "}
                  <Amount value={dashboard.chargeSummary.passThroughCharges} />
                </>
              }
            />
            <StatCard
              label="Broker VAT Lines"
              value={<Amount value={dashboard.chargeSummary.importVatLines} />}
              hint={
                <>
                  Service VAT <Amount value={dashboard.chargeSummary.serviceVat} />
                </>
              }
            />
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
                <EmptyState size="sm" title="No open import packets need follow-up." />
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
                        <TableCell className="text-right tabular-nums">
                          {packet.daysOpen}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {packet.linkedDocumentCount}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {packet.brokerChargeLineCount}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
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
                <EmptyState size="sm" title="No import packets recorded yet." />
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
                        <TableCell className="text-right">
                          <Amount value={packet.customsAssessedDutyThb} />
                        </TableCell>
                        <TableCell className="text-right">
                          <Amount value={packet.customsAssessedImportVatThb} />
                        </TableCell>
                        <TableCell>
                          <StatusBadge
                            status={packet.isFinalized ? "finalized" : "open"}
                          />
                        </TableCell>
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
