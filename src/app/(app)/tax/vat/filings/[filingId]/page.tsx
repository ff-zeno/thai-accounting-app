import { VatFilingDrilldownLedgerPage } from "../../_components/vat-ledger-pages";

export default async function VatFilingDrilldownPage({
  params,
}: {
  params: Promise<{ filingId: string }>;
}) {
  const { filingId } = await params;
  return <VatFilingDrilldownLedgerPage filingId={filingId} />;
}
