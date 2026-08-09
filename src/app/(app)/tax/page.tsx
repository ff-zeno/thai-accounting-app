import Link from "next/link";
import { Sparkles } from "lucide-react";
import { getActiveOrgId } from "@/lib/utils/org-context";
import { getOrganizationById } from "@/lib/db/queries/organizations";
import { formatBangkokDate } from "@/lib/tax/filing-deadlines";
import { getObligationsWithStatus } from "@/lib/tax/obligations";
import { PageHeader } from "@/components/ui/page-header";
import { NoOrgState } from "@/components/ui/empty-state";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ObligationsList } from "./obligations-list";

const MONTH_LABELS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

function monthLabel(year: number, month: number): string {
  return `${MONTH_LABELS[month - 1]} ${year}`;
}

export default async function TaxPage() {
  const orgId = await getActiveOrgId();
  if (!orgId) {
    return <NoOrgState />;
  }

  const org = await getOrganizationById(orgId);
  if (!org) {
    return <NoOrgState />;
  }

  // "This month" = the filings due in the current Bangkok month, i.e. the
  // previous calendar month's tax period (deadlines land the month after).
  const [todayYear, todayMonth] = formatBangkokDate(new Date())
    .split("-")
    .map(Number);
  const period =
    todayMonth === 1
      ? { year: todayYear - 1, month: 12 }
      : { year: todayYear, month: todayMonth - 1 };

  const snapshot = await getObligationsWithStatus(orgId, period);
  if (!snapshot) {
    return <NoOrgState />;
  }

  const profileUnset =
    !(org.isVatRegistered ?? false) &&
    !org.hasEmployees &&
    !org.hasImportedServices &&
    !org.hasPosSales;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tax"
        description={`Filings due in ${monthLabel(todayYear, todayMonth)} — covering the ${monthLabel(period.year, period.month)} tax period.`}
      />

      {profileUnset ? (
        <Alert variant="info">
          <Sparkles />
          <AlertTitle>Tell us about your business</AlertTitle>
          <AlertDescription>
            <p>
              Set up your tax profile — VAT registration, employees, foreign
              services — and this page shows exactly which forms you must file
              each month.{" "}
              <Link href="/settings" className="text-primary hover:underline">
                Go to Settings
              </Link>
            </p>
          </AlertDescription>
        </Alert>
      ) : null}

      <ObligationsList
        obligations={snapshot.obligations}
        notApplicable={snapshot.notApplicable}
      />
    </div>
  );
}
