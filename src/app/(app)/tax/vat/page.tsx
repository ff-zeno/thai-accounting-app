import { VatView } from "./vat-view";

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

interface VatPageProps {
  searchParams: Promise<{ year?: string; month?: string }>;
}

export default async function VatPage({ searchParams }: VatPageProps) {
  const params = await searchParams;
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
      <VatView
        initialYear={parseYearParam(params.year)}
        initialMonth={parseMonthParam(params.month)}
      />
    </div>
  );
}
