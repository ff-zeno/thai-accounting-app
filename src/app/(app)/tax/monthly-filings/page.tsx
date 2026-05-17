import { FilingView } from "./filing-view";

export default function MonthlyFilingsPage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">
          WHT Filings
        </h1>
        <p className="text-sm text-muted-foreground">
          Prepare and track monthly withholding tax filings and payment status.
        </p>
      </div>
      <FilingView />
    </div>
  );
}
