import Link from "next/link";
import { BadgePercent, Globe2, Landmark, ReceiptText } from "lucide-react";
import { and, eq, isNull } from "drizzle-orm";
import { getActiveOrgId } from "@/lib/utils/org-context";
import { db } from "@/lib/db";
import { vatFilings } from "@/lib/db/schema";
import { getFilingsByPeriod } from "@/lib/db/queries/wht-filings";
import { toBuddhistYear } from "@/lib/utils/thai-date";
import {
  getYearlyDeadlines,
  computeFilingStatus,
  getMonthName,
  formatFormType,
  type FilingFormType,
  type FilingStatus,
} from "@/lib/tax/filing-calendar";
import {
  DEFAULT_TAX_CONFIG,
  pp30EfilingDeadline,
  pp36Deadline,
} from "@/lib/tax/filing-deadlines";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type CalendarFormKey = "pp30" | "pp36" | FilingFormType;

const formColumns: Array<{
  key: CalendarFormKey;
  label: string;
  icon: typeof Landmark;
  tone: string;
}> = [
  { key: "pp30", label: "PP 30", icon: Landmark, tone: "text-sky-700" },
  { key: "pp36", label: "PP 36", icon: Globe2, tone: "text-violet-700" },
  { key: "pnd2", label: "PND 2", icon: ReceiptText, tone: "text-slate-700" },
  { key: "pnd3", label: "PND 3", icon: ReceiptText, tone: "text-slate-700" },
  { key: "pnd53", label: "PND 53", icon: ReceiptText, tone: "text-slate-700" },
  { key: "pnd54", label: "PND 54", icon: BadgePercent, tone: "text-amber-700" },
];

// ---------------------------------------------------------------------------
// Status badge styling
// ---------------------------------------------------------------------------

function statusBadgeVariant(
  status: FilingStatus
): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "filed":
    case "paid":
      return "default";
    case "due_soon":
      return "destructive";
    case "overdue":
      return "destructive";
    case "upcoming":
      return "secondary";
  }
}

function statusLabel(status: FilingStatus): string {
  switch (status) {
    case "filed":
      return "Filed";
    case "paid":
      return "Paid";
    case "due_soon":
      return "Due Soon";
    case "overdue":
      return "Overdue";
    case "upcoming":
      return "Upcoming";
  }
}

function vatStatusLabel(status: string | null, paymentStatus: string | null): FilingStatus {
  if (paymentStatus === "paid") return "paid";
  if (status === "filed") return "filed";
  return "upcoming";
}

function formLabel(formType: CalendarFormKey): string {
  if (formType === "pp30") return "PP 30";
  if (formType === "pp36") return "PP 36";
  return formatFormType(formType);
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

interface CalendarPageProps {
  searchParams: Promise<{ year?: string }>;
}

export default async function CalendarPage({ searchParams }: CalendarPageProps) {
  const params = await searchParams;
  const orgId = await getActiveOrgId();
  const currentYear = new Date().getFullYear();
  const selectedYear = params.year ? parseInt(params.year, 10) : currentYear;
  const beYear = toBuddhistYear(selectedYear);

  // Get all deadlines for the year
  const deadlines = getYearlyDeadlines(selectedYear);

  // Fetch actual filing records if we have an org
  const filingsByKey = new Map<string, {
    status: "draft" | "filed" | "paid";
    id: string;
    totalBaseAmount: string | null;
    totalWhtAmount: string | null;
  }>();
  const vatFilingsByKey = new Map<string, {
    status: string;
    paymentStatus: string;
    id: string;
    totalAmount: string | null;
    deadline: string | null;
  }>();

  if (orgId) {
    const filings = await getFilingsByPeriod(orgId, selectedYear);
    for (const f of filings) {
      const key = `${f.periodMonth}-${f.formType}`;
      filingsByKey.set(key, {
        status: f.status,
        id: f.id,
        totalBaseAmount: f.totalBaseAmount,
        totalWhtAmount: f.totalWhtAmount,
      });
    }

    const vatRows = await db
      .select({
        id: vatFilings.id,
        filingType: vatFilings.filingType,
        periodMonth: vatFilings.periodMonth,
        status: vatFilings.status,
        paymentStatus: vatFilings.paymentStatus,
        pp36VatTotal: vatFilings.pp36VatTotal,
        netPayable: vatFilings.netPayable,
        deadline: vatFilings.deadline,
      })
      .from(vatFilings)
      .where(
        and(
          eq(vatFilings.orgId, orgId),
          eq(vatFilings.periodYear, selectedYear),
          eq(vatFilings.filingKind, "ordinary"),
          isNull(vatFilings.deletedAt)
        )
      );
    for (const filing of vatRows) {
      const key = `${filing.periodMonth}-${filing.filingType}`;
      vatFilingsByKey.set(key, {
        status: filing.status,
        paymentStatus: filing.paymentStatus,
        id: filing.id,
        totalAmount:
          filing.filingType === "pp36"
            ? filing.pp36VatTotal
            : filing.netPayable,
        deadline: filing.deadline,
      });
    }
  }

  const now = new Date();

  // Build a 12-row grid across VAT and WHT form types.
  const calendarData = Array.from({ length: 12 }, (_, i) => {
    const month = i + 1;
    const cells = formColumns.map((column) => {
      if (column.key === "pp30" || column.key === "pp36") {
        const deadline =
          column.key === "pp30"
            ? pp30EfilingDeadline(selectedYear, month, DEFAULT_TAX_CONFIG).deadline
            : pp36Deadline(selectedYear, month, DEFAULT_TAX_CONFIG).deadline;
        const filing = vatFilingsByKey.get(`${month}-${column.key}`);
        return {
          formType: column.key,
          deadline: filing?.deadline ? new Date(filing.deadline) : deadline,
          status: filing
            ? vatStatusLabel(filing.status, filing.paymentStatus)
            : computeFilingStatus(null, deadline, now),
          filingId: filing?.id ?? null,
          amountLabel: column.key === "pp36" ? "VAT" : "Net",
          amount: filing?.totalAmount,
          href:
            column.key === "pp36"
              ? `/tax/vat?year=${selectedYear}&month=${month}`
              : `/tax/vat?year=${selectedYear}&month=${month}`,
        };
      }

      const deadline = deadlines.find(
        (d) => d.month === month && d.formType === column.key
      );
      const key = `${month}-${column.key}`;
      const filing = filingsByKey.get(key);
      return {
        formType: column.key,
        deadline: deadline?.deadline ?? null,
        status: computeFilingStatus(
          filing?.status ?? null,
          deadline?.deadline ?? new Date(),
          now
        ),
        filingId: filing?.id ?? null,
        amountLabel: "WHT",
        amount: filing?.totalWhtAmount,
        href: `/tax/monthly-filings?year=${selectedYear}&month=${month}`,
      };
    });
    return { month, cells };
  });

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Filing Calendar
          </h1>
          <p className="text-sm text-muted-foreground">
            VAT and WHT filing deadlines for {selectedYear} (B.E. {beYear})
          </p>
        </div>

        {/* Year navigation */}
        <div className="flex items-center gap-2">
          <Link
            href={`/tax/calendar?year=${selectedYear - 1}`}
            className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
          >
            {selectedYear - 1}
          </Link>
          <span className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground">
            {selectedYear}
          </span>
          <Link
            href={`/tax/calendar?year=${selectedYear + 1}`}
            className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
          >
            {selectedYear + 1}
          </Link>
        </div>
      </div>

      {/* Legend */}
      <Card className="mb-6">
        <CardContent className="flex flex-wrap gap-4 pt-4">
          <div className="flex items-center gap-1.5">
            <Badge variant="secondary">Upcoming</Badge>
            <span className="text-xs text-muted-foreground">Not yet due</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Badge variant="destructive">Due Soon</Badge>
            <span className="text-xs text-muted-foreground">Within 7 days</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Badge variant="destructive" className="font-bold">
              Overdue
            </Badge>
            <span className="text-xs text-muted-foreground">Past deadline</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Badge variant="default">Filed</Badge>
            <span className="text-xs text-muted-foreground">Submitted</span>
          </div>
        </CardContent>
      </Card>

      {/* Calendar table */}
      <Card>
        <CardHeader>
          <CardTitle>Monthly Filing Deadlines</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[100px]">Month</TableHead>
                {formColumns.map((column) => {
                  const Icon = column.icon;
                  return (
                    <TableHead key={column.key}>
                      <span className="inline-flex items-center gap-1.5">
                        <Icon className={`size-4 ${column.tone}`} />
                        {column.label}
                      </span>
                    </TableHead>
                  );
                })}
              </TableRow>
            </TableHeader>
            <TableBody>
              {calendarData.map((row) => (
                <TableRow key={row.month}>
                  <TableCell className="font-medium">
                    {getMonthName(row.month)} {selectedYear}
                  </TableCell>
                  {row.cells.map((cell) => (
                    <TableCell key={cell.formType}>
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                          <Badge variant={statusBadgeVariant(cell.status)}>
                            {cell.status === "overdue" ? (
                              <span className="font-bold">
                                {statusLabel(cell.status)}
                              </span>
                            ) : (
                              statusLabel(cell.status)
                            )}
                          </Badge>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {cell.deadline
                            ? `Due: ${cell.deadline.getDate()}/${cell.deadline.getMonth() + 1}/${toBuddhistYear(cell.deadline.getFullYear())}`
                            : "N/A"}
                        </span>
                        {cell.amount && parseFloat(cell.amount) > 0 && (
                          <span className="text-xs">
                            {cell.amountLabel}: {parseFloat(cell.amount).toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                          </span>
                        )}
                        <Link
                          href={cell.href}
                          className="text-xs text-primary hover:underline"
                        >
                          View {formLabel(cell.formType)}
                        </Link>
                      </div>
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
