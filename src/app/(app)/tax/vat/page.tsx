import { VatView } from "./vat-view";

export default function VatPage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">
          VAT Dashboard
        </h1>
        <p className="text-sm text-muted-foreground">
          VAT status, period summary, filing actions, and ledger drilldowns.
        </p>
      </div>
      <VatView />
    </div>
  );
}
