import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { ReviewException } from "@/lib/db/queries/dashboard";

interface Props {
  exceptions: ReviewException[];
}

const SEVERITY_LABELS: Record<string, string> = {
  p0: "P0",
  p1: "P1",
  p2: "P2",
  info: "Info",
};

function severityVariant(
  severity: string
): "default" | "secondary" | "destructive" | "outline" {
  if (severity === "p0" || severity === "p1") return "destructive";
  if (severity === "p2") return "default";
  return "secondary";
}

function targetHref(item: ReviewException): string {
  switch (item.entityType) {
    case "document":
      return `/documents/${item.entityId}/review`;
    case "transaction":
      return "/reconciliation/review";
    default:
      return "/dashboard";
  }
}

function formatExceptionType(type: string): string {
  return type
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function ExceptionReviewList({ exceptions }: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertTriangle className="size-4 text-amber-600" />
          Review Queue
        </CardTitle>
      </CardHeader>
      <CardContent>
        {exceptions.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            No open review items.
          </p>
        ) : (
          <div className="divide-y">
            {exceptions.map((item) => (
              <Link
                key={item.id}
                href={targetHref(item)}
                className="block py-3 transition-colors hover:bg-muted/50"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={severityVariant(item.severity)}>
                        {SEVERITY_LABELS[item.severity] ?? item.severity}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {formatExceptionType(item.exceptionType)}
                      </span>
                    </div>
                    <p className="text-sm font-medium leading-5">
                      {item.summary}
                    </p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
