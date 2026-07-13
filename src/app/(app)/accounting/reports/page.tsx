import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { reportGroups } from "@/components/reports/report-catalog";

export default function ReportsHubPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Reports"
        description="Every financial report in one place — pick the question you need answered."
      />

      {reportGroups.map((group) => (
        <section key={group.title} className="space-y-3">
          <h2 className="text-lg font-semibold">{group.title}</h2>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {group.reports.map((report) => (
              <Link key={report.href} href={report.href} className="block">
                <Card size="sm" className="h-full transition-colors hover:bg-muted/50">
                  <CardContent className="flex items-start gap-3">
                    <report.icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                    <div className="space-y-1">
                      <div className="text-sm font-medium">{report.title}</div>
                      <p className="text-sm text-muted-foreground">
                        {report.description}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
