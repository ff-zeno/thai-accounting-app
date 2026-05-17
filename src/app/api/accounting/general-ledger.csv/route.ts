import { type NextRequest, NextResponse } from "next/server";
import {
  getGeneralLedgerDetail,
  seedStandardGlAccounts,
} from "@/lib/db/queries/general-ledger";
import { generalLedgerDetailToCsv } from "@/lib/gl/accounting-report-export";
import { getVerifiedOrgId } from "@/lib/utils/org-context";

function parseDate(value: string | null) {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined;
}

function safeFilenamePart(value: string | undefined, fallback: string) {
  return (value || fallback).replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 80);
}

export async function GET(request: NextRequest) {
  const orgId = await getVerifiedOrgId();
  if (!orgId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const accountId = url.searchParams.get("accountId") ?? undefined;
  const startDate = parseDate(url.searchParams.get("startDate"));
  const endDate = parseDate(url.searchParams.get("endDate"));

  await seedStandardGlAccounts(orgId);
  const rows = await getGeneralLedgerDetail(orgId, {
    accountId,
    startDate,
    endDate,
    limit: 250,
  });
  const csv = generalLedgerDetailToCsv(rows);
  const filename = [
    "general-ledger",
    safeFilenamePart(startDate, "start"),
    safeFilenamePart(endDate, "end"),
  ].join("-");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}.csv"`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
}
