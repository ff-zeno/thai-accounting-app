import { type NextRequest, NextResponse } from "next/server";
import {
  buildFinancialStatementSummary,
  seedStandardGlAccounts,
} from "@/lib/db/queries/general-ledger";
import { balanceSheetToCsv } from "@/lib/gl/accounting-report-export";
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
  await seedStandardGlAccounts(orgId);
  const summary = await buildFinancialStatementSummary(orgId, asOfDate);
  const csv = balanceSheetToCsv(summary, asOfDate);

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="balance-sheet-${asOfDate}.csv"`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
}
