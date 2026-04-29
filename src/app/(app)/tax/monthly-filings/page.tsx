import { FilingView } from "./filing-view";

export default function MonthlyFilingsPage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">
          Monthly WHT Filings
        </h1>
        <p className="text-sm text-muted-foreground">
          Prepare and track PND 2, PND 3, PND 53, and PND 54 monthly filings.
        </p>
      </div>
      <FilingView />
    </div>
  );
}
