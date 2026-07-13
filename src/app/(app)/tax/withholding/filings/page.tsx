import { FilingView } from "./filing-view";

function parseYearParam(value: string | undefined): number | undefined {
  if (!value || !/^\d{4}$/.test(value)) return undefined;
  return Number(value);
}

function parseMonthParam(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const month = Number(value);
  if (!Number.isInteger(month) || month < 1 || month > 12) return undefined;
  return month;
}

interface WhtFilingsPageProps {
  searchParams: Promise<{ year?: string; month?: string }>;
}

export default async function WhtFilingsPage({
  searchParams,
}: WhtFilingsPageProps) {
  const params = await searchParams;
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
      <FilingView
        initialYear={parseYearParam(params.year)}
        initialMonth={parseMonthParam(params.month)}
      />
    </div>
  );
}
