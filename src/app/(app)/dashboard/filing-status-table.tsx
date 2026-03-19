import { getTranslations } from "next-intl/server";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface FilingDeadline {
  filingType: string;
  period: string;
  status: string;
  deadline: string;
  daysRemaining: number;
}

interface Props {
  deadlines: FilingDeadline[];
}

export async function FilingStatusTable({ deadlines }: Props) {
  const t = await getTranslations("dashboard");

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("filingStatus")}</CardTitle>
      </CardHeader>
      <CardContent>
        {deadlines.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            {t("noFilings")}
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("filingType")}</TableHead>
                <TableHead>{t("period")}</TableHead>
                <TableHead>{t("deadline")}</TableHead>
                <TableHead>{t("daysRemaining")}</TableHead>
                <TableHead className="text-right">{t("filingStatus")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {deadlines.map((item, i) => {
                const isOverdue = item.daysRemaining < 0 && item.status !== "filed";
                const isUpcoming =
                  item.daysRemaining >= 0 &&
                  item.daysRemaining <= 7 &&
                  item.status !== "filed";

                return (
                  <TableRow
                    key={`${item.filingType}-${item.period}-${i}`}
                    className={cn(
                      isOverdue && "bg-red-50 dark:bg-red-950/20",
                      isUpcoming && "bg-yellow-50 dark:bg-yellow-950/20"
                    )}
                  >
                    <TableCell className="font-medium">
                      {item.filingType}
                    </TableCell>
                    <TableCell>{item.period}</TableCell>
                    <TableCell>{item.deadline}</TableCell>
                    <TableCell>
                      <span
                        className={cn(
                          "text-sm",
                          isOverdue && "font-medium text-red-600 dark:text-red-400",
                          isUpcoming && "font-medium text-yellow-600 dark:text-yellow-400"
                        )}
                      >
                        {isOverdue
                          ? `${Math.abs(item.daysRemaining)}d ${t("overdue").toLowerCase()}`
                          : `${item.daysRemaining}d`}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <FilingBadge status={item.status} />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function FilingBadge({ status }: { status: string }) {
  switch (status) {
    case "filed":
      return <Badge variant="default">Filed</Badge>;
    case "paid":
      return <Badge variant="default">Paid</Badge>;
    default:
      return <Badge variant="secondary">Draft</Badge>;
  }
}
