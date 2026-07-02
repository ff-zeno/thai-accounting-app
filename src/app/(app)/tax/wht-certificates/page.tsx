import { AlertTriangle, FileText } from "lucide-react";
import { getActiveOrgId } from "@/lib/utils/org-context";
import { getCertificatesWithVendors } from "@/lib/db/queries/wht-certificates";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { PageHeader } from "@/components/ui/page-header";
import {
  CertificateTable,
  type CertificateRow,
} from "./certificate-table";

export default async function WhtCertificatesPage() {
  const orgId = await getActiveOrgId();

  if (!orgId) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-20 text-center">
        <FileText className="size-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          Select an organization to view WHT certificates
        </p>
      </div>
    );
  }

  const rawCerts = await getCertificatesWithVendors(orgId);

  const certificates: CertificateRow[] = rawCerts.map((cert) => ({
    id: cert.id,
    certificateNo: cert.certificateNo,
    formType: cert.formType,
    paymentDate: cert.paymentDate,
    issuedDate: cert.issuedDate,
    totalBaseAmount: cert.totalBaseAmount,
    totalWht: cert.totalWht,
    status: cert.status,
    pdfUrl: cert.pdfUrl,
    rateBelowDefaultAcknowledgedAt: cert.rateBelowDefaultAcknowledgedAt,
    rateBelowDefaultStatutoryRate: cert.rateBelowDefaultStatutoryRate,
    rateBelowDefaultSelectedRate: cert.rateBelowDefaultSelectedRate,
    rateBelowDefaultRationale: cert.rateBelowDefaultRationale,
    vendorName: cert.vendorName ?? "Unknown",
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Outgoing WHT"
        description="Withholding tax we deduct when paying vendors, including certificates issued to payees."
      />
      <Alert variant="warning">
        <AlertTriangle />
        <AlertDescription>
          Certificate generation and register links are covered locally. Before relying
          on uploaded certificate URLs in production, run live Blob/Inngest storage QA
          and confirm generated PDFs are retrievable from browser storage links.
        </AlertDescription>
      </Alert>
      <CertificateTable certificates={certificates} />
    </div>
  );
}
