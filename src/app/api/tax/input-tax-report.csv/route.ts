import { type NextRequest, NextResponse } from "next/server";
import { getVerifiedOrgId } from "@/lib/utils/org-context";
import { buildInputTaxReport } from "@/lib/tax/input-tax-report";
import { inputTaxReportToCsv } from "@/lib/tax/input-tax-report-export";
import { formatBangkokDate } from "@/lib/tax/filing-deadlines";

function parseMonth(value: string | null, fallback: number) {
  const parsed = value ? Number.parseInt(value, 10) : fallback;
  return parsed >= 1 && parsed <= 12 ? parsed : fallback;
}

function parseYear(value: string | null, fallback: number) {
  const parsed = value ? Number.parseInt(value, 10) : fallback;
  return parsed >= 2000 && parsed <= 2100 ? parsed : fallback;
}

export async function GET(request: NextRequest) {
  const orgId = await getVerifiedOrgId();
  if (!orgId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const today = formatBangkokDate(new Date());
  const fallbackYear = Number(today.slice(0, 4));
  const fallbackMonth = Number(today.slice(5, 7));
  const periodYear = parseYear(url.searchParams.get("year"), fallbackYear);
  const periodMonth = parseMonth(url.searchParams.get("month"), fallbackMonth);

  const report = await buildInputTaxReport({
    orgId,
    periodYear,
    periodMonth,
  });
  const csv = inputTaxReportToCsv(report);
  const filename = `input-tax-report-${periodYear}-${String(periodMonth).padStart(2, "0")}.csv`;

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
}
