import { FileText } from "lucide-react";
import { getActiveOrgId } from "@/lib/utils/org-context";
import { getCertificatesWithVendors } from "@/lib/db/queries/wht-certificates";
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
    vendorName: cert.vendorName ?? "Unknown",
  }));

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">
          WHT Certificates
        </h1>
        <p className="text-sm text-muted-foreground">
          50 Tawi withholding tax certificates
        </p>
      </div>
      <CertificateTable certificates={certificates} />
    </div>
  );
}
