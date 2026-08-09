import Link from "next/link";
import { Upload } from "lucide-react";

import { Amount } from "@/components/ui/amount";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { TableCard } from "@/components/ui/table-card";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { sumAmounts } from "@/lib/utils/money";

export interface SettlementRow {
  id: string;
  processor: string;
  externalId: string;
  periodStart: Date | null;
  periodEnd: Date | null;
  grossAmount: string;
  feeAmount: string;
  feeVatAmount: string | null;
  netPayout: string;
  reconciliationStatus: string;
}

function formatPeriod(start: Date | null, end: Date | null): string {
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  if (start && end) return `${fmt(start)} – ${fmt(end)}`;
  if (end) return fmt(end);
  if (start) return fmt(start);
  return "—";
}

/**
 * The settlement register.
 *
 * Gross is shown alongside net on every row on purpose: gross is the output-VAT
 * base and net is only what the bank deposit should match. Showing net alone
 * would invite reading the payout as the income figure, which under-reports
 * output VAT.
 */
export function SettlementTable({
  settlements,
  importHref,
}: {
  settlements: SettlementRow[];
  importHref: string;
}) {
  if (settlements.length === 0) {
    return (
      <TableCard tone="income">
        <EmptyState
          icon={<Upload />}
          title="No settlements imported"
          description="Import a processor settlement report to explain the payouts landing in your bank account."
          action={
            <Button render={<Link href={importHref} />}>
              Import settlements
            </Button>
          }
        />
      </TableCard>
    );
  }

  const totals = {
    gross: sumAmounts(settlements.map((s) => s.grossAmount)),
    fee: sumAmounts(settlements.map((s) => s.feeAmount)),
    feeVat: sumAmounts(settlements.map((s) => s.feeVatAmount)),
    net: sumAmounts(settlements.map((s) => s.netPayout)),
  };

  return (
    <TableCard
      tone="income"
      title="Settlements"
      description="Gross is the VAT base — net is only what the bank deposit should match"
    >
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Processor</TableHead>
            <TableHead>Settlement</TableHead>
            <TableHead>Period</TableHead>
            <TableHead className="text-right">Gross</TableHead>
            <TableHead className="text-right">Fee</TableHead>
            <TableHead className="text-right">Fee VAT</TableHead>
            <TableHead className="text-right">Net to bank</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {settlements.map((settlement) => (
            <TableRow key={settlement.id}>
              <TableCell className="font-medium">{settlement.processor}</TableCell>
              <TableCell className="text-muted-foreground">
                {settlement.externalId}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {formatPeriod(settlement.periodStart, settlement.periodEnd)}
              </TableCell>
              <TableCell className="text-right">
                <Amount value={settlement.grossAmount} />
              </TableCell>
              <TableCell className="text-right text-muted-foreground">
                <Amount value={settlement.feeAmount} />
              </TableCell>
              <TableCell className="text-right text-muted-foreground">
                <Amount value={settlement.feeVatAmount ?? "0.00"} />
              </TableCell>
              <TableCell className="text-right font-medium">
                <Amount value={settlement.netPayout} />
              </TableCell>
              <TableCell>
                <StatusBadge status={settlement.reconciliationStatus} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableCell colSpan={3}>Total</TableCell>
            <TableCell className="text-right">
              <Amount value={totals.gross} />
            </TableCell>
            <TableCell className="text-right">
              <Amount value={totals.fee} />
            </TableCell>
            <TableCell className="text-right">
              <Amount value={totals.feeVat} />
            </TableCell>
            <TableCell className="text-right">
              <Amount value={totals.net} />
            </TableCell>
            <TableCell />
          </TableRow>
        </TableFooter>
      </Table>
    </TableCard>
  );
}
