import { VatView } from "./vat-view";

export default function VatPage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">
          VAT Management
        </h1>
        <p className="text-sm text-muted-foreground">
          PP 30 and PP 36 filing, VAT register, and nil filing tracking.
        </p>
      </div>
      <VatView />
    </div>
  );
}
