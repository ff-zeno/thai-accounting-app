import Link from "next/link";
import { Upload } from "lucide-react";

import { getActiveOrgId } from "@/lib/utils/org-context";
import { listSettlements } from "@/lib/db/queries/processor-settlements";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { FlowStrip } from "@/components/ui/flow-strip";
import { sumAmounts } from "@/lib/utils/money";
import {
  SettlementTable,
  type SettlementRow,
} from "./settlement-table";

const IMPORT_HREF = "/income/settlements/import";

export default async function SettlementsPage() {
  const orgId = await getActiveOrgId();
  const settlements = orgId ? await listSettlements(orgId) : [];

  const totals = {
    gross: sumAmounts(settlements.map((s) => s.grossAmount)),
    fee: sumAmounts(settlements.map((s) => s.feeAmount)),
    feeVat: sumAmounts(settlements.map((s) => s.feeVatAmount)),
    net: sumAmounts(settlements.map((s) => s.netPayout)),
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settlements"
        description="What each processor says it paid you, and whether it landed."
      >
        <Button render={<Link href={IMPORT_HREF} />}>
          <Upload className="mr-2 size-4" />
          Import settlements
        </Button>
      </PageHeader>

      {settlements.length > 0 && (
        <FlowStrip
          steps={[
            {
              label: "Gross sales",
              value: totals.gross,
              hint: "The output-VAT base",
            },
            { label: "Processor fees", value: totals.fee, op: "minus" },
            { label: "VAT on fees", value: totals.feeVat, op: "minus" },
            { label: "Net to bank", value: totals.net, op: "equals" },
          ]}
        />
      )}

      <SettlementTable
        settlements={settlements as SettlementRow[]}
        importHref={IMPORT_HREF}
      />
    </div>
  );
}
