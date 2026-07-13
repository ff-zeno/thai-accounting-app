import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type {
  NotApplicableObligation,
  ObligationWithStatus,
} from "@/lib/tax/obligations";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { StatusBadge } from "@/components/status-badge";

const bangkokDateFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Bangkok",
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
});

function formatDueDate(date: Date): string {
  return bangkokDateFormat.format(date);
}

/**
 * Reusable "this month's obligations" card list — takes derived data as
 * props so the dashboard can embed the same list later.
 */
export function ObligationsList({
  obligations,
  notApplicable,
}: {
  obligations: ObligationWithStatus[];
  notApplicable: NotApplicableObligation[];
}) {
  return (
    <div className="space-y-4">
      {obligations.map((obligation) => (
        <Card key={obligation.key}>
          <CardHeader>
            <CardTitle>{obligation.form}</CardTitle>
            <CardDescription>{obligation.appliesBecause}</CardDescription>
            <CardAction>
              <StatusBadge status={obligation.displayStatus} />
            </CardAction>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm">{obligation.what}</p>
            <p className="text-sm text-muted-foreground">{obligation.why}</p>
            {obligation.conditionalNote ? (
              <p className="text-sm text-muted-foreground italic">
                {obligation.conditionalNote}
              </p>
            ) : null}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3">
              <div className="text-sm">
                <span className="font-medium">
                  Due {formatDueDate(obligation.dueDate)}
                </span>
                {obligation.dueDateIsEfiling ? (
                  <span className="text-muted-foreground"> (e-filing)</span>
                ) : null}
                {obligation.efilingDueDate ? (
                  <span className="text-muted-foreground">
                    {" "}
                    · e-filing until {formatDueDate(obligation.efilingDueDate)}
                  </span>
                ) : null}
              </div>
              <Button
                variant="outline"
                size="sm"
                render={<Link href={obligation.workbenchHref} />}
              >
                Open {obligation.form}
                <ChevronRight className="size-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}

      {notApplicable.length > 0 ? (
        <details className="rounded-lg border px-4 py-3">
          <summary className="cursor-pointer text-sm font-medium text-muted-foreground select-none">
            Not applicable to your business ({notApplicable.length})
          </summary>
          <ul className="mt-3 space-y-3">
            {notApplicable.map((entry) => (
              <li key={entry.key} className="text-sm">
                <span className="font-medium">{entry.form}</span>
                <span className="text-muted-foreground"> — {entry.reason}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-sm text-muted-foreground">
            Changed something?{" "}
            <Link href="/settings" className="text-primary hover:underline">
              Update your tax profile in Settings
            </Link>{" "}
            and this page adjusts.
          </p>
        </details>
      ) : null}
    </div>
  );
}
