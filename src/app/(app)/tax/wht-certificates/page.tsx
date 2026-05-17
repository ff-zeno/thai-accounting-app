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
    rateBelowDefaultAcknowledgedAt: cert.rateBelowDefaultAcknowledgedAt,
    rateBelowDefaultStatutoryRate: cert.rateBelowDefaultStatutoryRate,
    rateBelowDefaultSelectedRate: cert.rateBelowDefaultSelectedRate,
    rateBelowDefaultRationale: cert.rateBelowDefaultRationale,
    vendorName: cert.vendorName ?? "Unknown",
  }));

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">
          Outgoing WHT
        </h1>
        <p className="text-sm text-muted-foreground">
          Withholding tax we deduct when paying vendors, including certificates issued to payees.
        </p>
      </div>
      <div className="mb-4 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-800">
        Certificate generation and register links are covered locally. Before relying
        on uploaded certificate URLs in production, run live Blob/Inngest storage QA
        and confirm generated PDFs are retrievable from browser storage links.
      </div>
      <CertificateTable certificates={certificates} />
    </div>
  );
}
