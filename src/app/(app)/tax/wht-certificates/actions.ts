"use server";

import { revalidatePath } from "next/cache";
import { eq, and } from "drizzle-orm";
import { getVerifiedOrgId } from "@/lib/utils/org-context";
import { getOrganizationById } from "@/lib/db/queries/organizations";
import { getVendorById } from "@/lib/db/queries/vendors";
import {
  getCertificateWithItems,
  getCertificatesByOrg,
  type WhtFormType,
} from "@/lib/db/queries/wht-certificates";
import { renderFiftyTawiPdf, type FiftyTawiData } from "@/lib/pdf/fifty-tawi";
import { createStorage } from "@/lib/storage";
import { db } from "@/lib/db";
import { whtCertificates } from "@/lib/db/schema";
import { orgScope } from "@/lib/db/helpers/org-scope";

export async function generateCertificatePdfAction(
  certId: string
): Promise<{ url?: string; error?: string }> {
  const orgId = await getVerifiedOrgId();
  if (!orgId) return { error: "No organization selected" };

  // Load certificate with items
  const cert = await getCertificateWithItems(orgId, certId);
  if (!cert) return { error: "Certificate not found" };

  // Load org (payer) data
  const org = await getOrganizationById(orgId);
  if (!org) return { error: "Organization not found" };

  // Load vendor (payee) data
  const vendor = await getVendorById(orgId, cert.payeeVendorId);
  if (!vendor) return { error: "Vendor not found" };

  // Build PDF data
  const pdfData: FiftyTawiData = {
    certificateNo: cert.certificateNo,
    formType: cert.formType,
    paymentDate: cert.paymentDate,
    issuedDate: cert.issuedDate,
    totalBaseAmount: cert.totalBaseAmount,
    totalWht: cert.totalWht,
    payer: {
      name: org.name,
      nameTh: org.nameTh,
      taxId: org.taxId,
      branchNumber: org.branchNumber,
      address: org.address,
      addressTh: org.addressTh,
    },
    payee: {
      name: vendor.name,
      nameTh: vendor.nameTh,
      taxId: vendor.taxId,
      branchNumber: vendor.branchNumber,
      address: vendor.address,
      addressTh: vendor.addressTh,
    },
    items: cert.items.map((item) => ({
      whtType: item.whtType,
      rdPaymentTypeCode: item.rdPaymentTypeCode,
      baseAmount: item.baseAmount,
      whtRate: item.whtRate,
      whtAmount: item.whtAmount,
    })),
  };

  // Render PDF
  const pdfBuffer = await renderFiftyTawiPdf(pdfData);

  // Upload to blob storage
  const storage = createStorage();
  const storagePath = `wht-certificates/${orgId}/${cert.certificateNo.replace(/\//g, "-")}.pdf`;
  const { url } = await storage.upload(storagePath, pdfBuffer, "application/pdf");

  // Save URL to certificate record
  await db
    .update(whtCertificates)
    .set({ pdfUrl: url })
    .where(
      and(
        ...orgScope(whtCertificates, orgId),
        eq(whtCertificates.id, certId)
      )
    );

  revalidatePath("/tax/wht-certificates");
  return { url };
}

export async function listCertificatesAction(filters?: {
  formType?: WhtFormType;
  status?: string;
}) {
  const orgId = await getVerifiedOrgId();
  if (!orgId) return [];

  return getCertificatesByOrg(orgId, filters);
}
