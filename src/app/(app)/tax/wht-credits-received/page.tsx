import { FileText } from "lucide-react";
import { getActiveOrgId } from "@/lib/utils/org-context";
import { getVendorsByOrg } from "@/lib/db/queries/vendors";
import {
  getWhtCreditsReceived,
  getWhtCreditsReceivedTotal,
} from "@/lib/db/queries/wht-credits-received";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { WhtCreditReceivedForm } from "./credit-form";

function formatAmount(value: string | null): string {
  if (!value) return "0.00";
  return Number(value).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export default async function WhtCreditsReceivedPage() {
  const orgId = await getActiveOrgId();

  if (!orgId) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-20 text-center">
        <FileText className="size-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          Select an organization to view WHT credits received
        </p>
      </div>
    );
  }

  const currentYear = new Date().getFullYear();
  const [vendors, credits, total] = await Promise.all([
    getVendorsByOrg(orgId, undefined, 100),
    getWhtCreditsReceived(orgId, currentYear),
    getWhtCreditsReceivedTotal(orgId, currentYear),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          WHT Credits Received
        </h1>
        <p className="text-sm text-muted-foreground">
          Track 50 Tawi certificates received from customers for PND.50 credit.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>New Credit</CardTitle>
        </CardHeader>
        <CardContent>
          <WhtCreditReceivedForm vendors={vendors} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            {currentYear} Credit Total: {formatAmount(total)} THB
          </CardTitle>
        </CardHeader>
        <CardContent>
          {credits.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No WHT credits recorded for this tax year.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Payment Date</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Certificate</TableHead>
                  <TableHead>Form</TableHead>
                  <TableHead className="text-right">Gross</TableHead>
                  <TableHead className="text-right">WHT Credit</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {credits.map((credit) => (
                  <TableRow key={credit.id}>
                    <TableCell>{credit.paymentDate}</TableCell>
                    <TableCell>
                      {credit.customerNameTh
                        ? `${credit.customerNameTh} / ${credit.customerName}`
                        : credit.customerName}
                    </TableCell>
                    <TableCell>{credit.certificateNo ?? "-"}</TableCell>
                    <TableCell>{credit.formType}</TableCell>
                    <TableCell className="text-right font-mono">
                      {formatAmount(credit.grossAmount)}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {formatAmount(credit.whtAmount)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
