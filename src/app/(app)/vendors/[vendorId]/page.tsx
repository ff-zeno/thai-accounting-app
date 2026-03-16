import { notFound } from "next/navigation";
import { getActiveOrgId } from "@/lib/utils/org-context";
import { getVendorById } from "@/lib/db/queries/vendors";
import { VendorEditForm } from "./vendor-edit-form";

export default async function VendorDetailPage({
  params,
}: {
  params: Promise<{ vendorId: string }>;
}) {
  const { vendorId } = await params;
  const orgId = await getActiveOrgId();
  if (!orgId) notFound();

  const vendor = await getVendorById(orgId, vendorId);
  if (!vendor) notFound();

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-semibold">{vendor.name}</h1>
      <VendorEditForm vendor={vendor} />
    </div>
  );
}
