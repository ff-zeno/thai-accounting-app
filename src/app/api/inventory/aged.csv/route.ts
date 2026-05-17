import { type NextRequest, NextResponse } from "next/server";
import { getAgedInventoryReport } from "@/lib/db/queries/inventory";
import { agedInventoryToCsv } from "@/lib/inventory/inventory-report-export";
import { formatBangkokDate } from "@/lib/tax/filing-deadlines";
import { getVerifiedOrgId } from "@/lib/utils/org-context";

function parseDate(value: string | null, fallback: string) {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : fallback;
}

export async function GET(request: NextRequest) {
  const orgId = await getVerifiedOrgId();
  if (!orgId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const asOfDate = parseDate(url.searchParams.get("asOfDate"), formatBangkokDate(new Date()));
  const rows = await getAgedInventoryReport({ orgId, asOfDate });
  const csv = agedInventoryToCsv(rows);
  const filename = `aged-inventory-${asOfDate}.csv`;

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
}
