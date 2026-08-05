import { type NextRequest, NextResponse } from "next/server";
import { listEstablishments } from "@/lib/db/queries/establishments";
import { getVerifiedOrgId } from "@/lib/utils/org-context";
import { buildOutputTaxReport } from "@/lib/tax/output-tax-report";
import { outputTaxReportToCsv } from "@/lib/tax/output-tax-report-export";
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
  const establishmentList = await listEstablishments(orgId);
  const establishmentId = url.searchParams.get("establishmentId");
  const establishment =
    establishmentId
      ? establishmentList.find((entry) => entry.id === establishmentId)
      : establishmentList.find((entry) => entry.isHeadOffice) ??
        establishmentList[0];

  if (!establishment) {
    return NextResponse.json({ error: "Establishment not found" }, { status: 404 });
  }

  const report = await buildOutputTaxReport({
    orgId,
    establishmentId: establishment.id,
    periodYear,
    periodMonth,
  });
  const csv = outputTaxReportToCsv(report);
  const safeBranchNumber = establishment.branchNumber.replace(/[^0-9A-Za-z_-]/g, "");
  const filename = `output-tax-report-${periodYear}-${String(periodMonth).padStart(2, "0")}-${safeBranchNumber || "branch"}.csv`;

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
}
