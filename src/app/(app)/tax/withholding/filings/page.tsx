import { PageHeader } from "@/components/ui/page-header";
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
      <PageHeader
        className="mb-6"
        title="WHT Filings"
        description="Prepare and track monthly withholding tax filings and payment status."
      />
      <FilingView
        initialYear={parseYearParam(params.year)}
        initialMonth={parseMonthParam(params.month)}
      />
    </div>
  );
}
