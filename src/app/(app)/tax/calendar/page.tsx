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
  pp30EfilingDeadline,
  pp36Deadline,
} from "@/lib/tax/filing-deadlines";
import { getFilingDeadlineConfig } from "@/lib/db/queries/tax-config";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/status-badge";

type CalendarFormKey = "pp30" | "pp36" | FilingFormType;

const formColumns: Array<{
  key: CalendarFormKey;
  label: string;
  icon: typeof Landmark;
}> = [
  { key: "pp30", label: "PP 30", icon: Landmark },
  { key: "pp36", label: "PP 36", icon: Globe2 },
  { key: "pnd2", label: "PND 2", icon: ReceiptText },
  { key: "pnd3", label: "PND 3", icon: ReceiptText },
  { key: "pnd53", label: "PND 53", icon: ReceiptText },
  { key: "pnd54", label: "PND 54", icon: BadgePercent },
];

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
  const deadlineConfig = await getFilingDeadlineConfig();

  // Build a 12-row grid across VAT and WHT form types.
  const calendarData = Array.from({ length: 12 }, (_, i) => {
    const month = i + 1;
    const cells = formColumns.map((column) => {
      if (column.key === "pp30" || column.key === "pp36") {
        const deadline =
          column.key === "pp30"
            ? pp30EfilingDeadline(selectedYear, month, deadlineConfig).deadline
            : pp36Deadline(selectedYear, month, deadlineConfig).deadline;
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
    <div className="space-y-6">
      <PageHeader
        title="Filing Calendar"
        description={`VAT and WHT filing deadlines for ${selectedYear} (B.E. ${beYear})`}
      >
        {/* Year navigation */}
        <Button
          variant="outline"
          size="sm"
          render={<Link href={`/tax/calendar?year=${selectedYear - 1}`} />}
        >
          {selectedYear - 1}
        </Button>
        <Button
          size="sm"
          render={<Link href={`/tax/calendar?year=${selectedYear}`} />}
        >
          {selectedYear}
        </Button>
        <Button
          variant="outline"
          size="sm"
          render={<Link href={`/tax/calendar?year=${selectedYear + 1}`} />}
        >
          {selectedYear + 1}
        </Button>
      </PageHeader>

      {/* Legend */}
      <Card>
        <CardContent className="flex flex-wrap gap-4 pt-4">
          <div className="flex items-center gap-1.5">
            <StatusBadge status="upcoming" />
            <span className="text-xs text-muted-foreground">Not yet due</span>
          </div>
          <div className="flex items-center gap-1.5">
            <StatusBadge status="due_soon" />
            <span className="text-xs text-muted-foreground">Within 7 days</span>
          </div>
          <div className="flex items-center gap-1.5">
            <StatusBadge status="overdue" />
            <span className="text-xs text-muted-foreground">Past deadline</span>
          </div>
          <div className="flex items-center gap-1.5">
            <StatusBadge status="filed" />
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
                        <Icon className="size-4 text-muted-foreground" />
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
                          <StatusBadge status={cell.status} />
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
