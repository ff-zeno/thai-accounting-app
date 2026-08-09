import { getActiveOrgId } from "@/lib/utils/org-context";
import {
  getSettlementMatchStats,
  listPayoutQueue,
} from "@/lib/db/queries/processor-settlements";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { PayoutQueue, type PayoutQueueRow } from "./payout-queue";

export default async function PayoutsPage() {
  const orgId = await getActiveOrgId();
  const [rows, stats] = orgId
    ? await Promise.all([listPayoutQueue(orgId), getSettlementMatchStats(orgId)])
    : [[], { total: 0, matched: 0, suggested: 0, unreconciled: 0, matchRate: 0 }];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Payouts"
        description="Which bank deposit each merchant settlement explains."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/*
          Settlement match rate is its own stat rather than part of the
          insights dashboard's document match rate. Blending the two would make
          one headline number mean two different things.
        */}
        <StatCard
          label="Payout match rate"
          value={`${stats.matchRate}%`}
          hint={`${stats.matched + stats.suggested} of ${stats.total} settlements claimed`}
        />
        <StatCard label="Awaiting review" value={stats.suggested} />
        <StatCard label="Confirmed" value={stats.matched} />
        <StatCard
          label="No deposit found"
          value={stats.unreconciled}
          hint="Payouts with nothing on the statement yet"
        />
      </div>

      <PayoutQueue rows={rows as PayoutQueueRow[]} />
    </div>
  );
}
