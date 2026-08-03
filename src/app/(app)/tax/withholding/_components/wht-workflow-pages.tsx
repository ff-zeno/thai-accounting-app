import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import type { TaxWorkflowException } from "@/lib/db/queries/tax-workflow-exceptions";

const whtAreas = [
  {
    title: "Incoming WHT",
    href: "/tax/withholding/incoming",
    description:
      "Tax credits withheld by customers when they pay us, backed by certificates we receive.",
  },
  {
    title: "Outgoing WHT",
    href: "/tax/withholding/outgoing",
    description:
      "Tax we withhold when paying vendors or contractors, including certificates we issue.",
  },
  {
    title: "WHT Register",
    href: "/tax/withholding/register",
    description:
      "Tabular evidence and control lists for incoming credits, outgoing certificates, and filing status.",
  },
  {
    title: "WHT Filings",
    href: "/tax/withholding/filings",
    description:
      "Monthly PND filing preparation and filing status for withheld tax.",
  },
];

export function WithholdingDashboardPage({
  exceptions = [],
}: {
  exceptions?: TaxWorkflowException[];
}) {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Withholding Tax Dashboard"
        description="Manage withholding tax from both directions: tax customers withheld from us and tax we withheld from payees."
      />

      <div className="grid gap-4 md:grid-cols-2">
        {whtAreas.map((area) => (
          <Link key={area.href} href={area.href}>
            <Card className="h-full transition-colors hover:bg-accent/40">
              <CardHeader>
                <CardTitle className="flex items-center justify-between gap-3 text-base">
                  {area.title}
                  <ArrowRight className="size-4 text-muted-foreground" />
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{area.description}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Tax Workflow Exceptions</CardTitle>
        </CardHeader>
        <CardContent>
          {exceptions.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No open tax workflow exceptions.
            </p>
          ) : (
            <div className="space-y-3">
              {exceptions.slice(0, 8).map((exception) => (
                <div
                  key={`${exception.area}-${exception.id}`}
                  className="flex flex-col gap-1 border-b pb-3 text-sm last:border-0 last:pb-0 md:flex-row md:items-center md:justify-between"
                >
                  <div>
                    <div className="font-medium">{exception.summary}</div>
                    <div className="text-xs text-muted-foreground">
                      {exception.area} / {exception.severity}
                    </div>
                  </div>
                  <Link
                    href={exception.sourceHref}
                    className="text-primary underline-offset-4 hover:underline"
                  >
                    Open
                  </Link>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
