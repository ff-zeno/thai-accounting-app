import { getActiveOrgId } from "@/lib/utils/org-context";
import { getVendorsByOrg } from "@/lib/db/queries/vendors";
import { PageHeader } from "@/components/ui/page-header";
import { VendorList } from "./vendor-list";

export default async function VendorsPage() {
  const orgId = await getActiveOrgId();
  if (!orgId) {
    return (
      <div className="py-20 text-center text-muted-foreground">
        Select an organization to view vendors.
      </div>
    );
  }

  const vendorRows = await getVendorsByOrg(orgId);

  return (
    <div className="space-y-6">
      <PageHeader title="Vendors" />
      <VendorList vendors={vendorRows} />
    </div>
  );
}
