import { type NextRequest, NextResponse } from "next/server";
import { getFixedAssetRollForward } from "@/lib/db/queries/fixed-assets";
import { fixedAssetRollForwardToCsv } from "@/lib/fixed-assets/fixed-asset-report-export";
import { getVerifiedOrgId } from "@/lib/utils/org-context";

function parseYear(value: string | null, fallback: number) {
  const parsed = value ? Number.parseInt(value, 10) : fallback;
  return parsed >= 2000 && parsed <= 2200 ? parsed : fallback;
}

export async function GET(request: NextRequest) {
  const orgId = await getVerifiedOrgId();
  if (!orgId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const year = parseYear(url.searchParams.get("year"), new Date().getUTCFullYear());
  const rows = await getFixedAssetRollForward({
    orgId,
    fromDate: `${year}-01-01`,
    toDate: `${year}-12-31`,
  });
  const csv = fixedAssetRollForwardToCsv(rows);

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="fixed-asset-roll-forward-${year}.csv"`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
}
