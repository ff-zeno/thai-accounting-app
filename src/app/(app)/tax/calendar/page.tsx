import Link from "next/link";
import { getActiveOrgId } from "@/lib/utils/org-context";
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
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

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
  }

  const now = new Date();
  const formTypes: FilingFormType[] = ["pnd3", "pnd53", "pnd54"];

  // Build a 12-row x 3-column grid
  const calendarData = Array.from({ length: 12 }, (_, i) => {
    const month = i + 1;
    const cells = formTypes.map((formType) => {
      const deadline = deadlines.find(
        (d) => d.month === month && d.formType === formType
      );
      const key = `${month}-${formType}`;
      const filing = filingsByKey.get(key);
      const status = computeFilingStatus(
        filing?.status ?? null,
        deadline?.deadline ?? new Date(),
        now
      );
      return {
        formType,
        deadline: deadline?.deadline ?? null,
        status,
        filingId: filing?.id ?? null,
        totalWht: filing?.totalWhtAmount,
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
            WHT filing deadlines for {selectedYear} (B.E. {beYear})
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
          <CardTitle>Monthly WHT Filing Deadlines</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[100px]">Month</TableHead>
                {formTypes.map((ft) => (
                  <TableHead key={ft}>{formatFormType(ft)}</TableHead>
                ))}
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
                        {cell.totalWht && parseFloat(cell.totalWht) > 0 && (
                          <span className="text-xs">
                            WHT: {parseFloat(cell.totalWht).toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                          </span>
                        )}
                        <Link
                          href={`/tax/monthly-filings?year=${selectedYear}&month=${row.month}`}
                          className="text-xs text-primary hover:underline"
                        >
                          View filing
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
