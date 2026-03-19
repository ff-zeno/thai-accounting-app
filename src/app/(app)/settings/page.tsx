import { getActiveOrgId } from "@/lib/utils/org-context";
import { getOrganizationById } from "@/lib/db/queries/organizations";
import { OrgSettingsForm } from "./org-settings-form";

export default async function SettingsPage() {
  const orgId = await getActiveOrgId();

  if (!orgId) {
    return (
      <div className="py-20 text-center">
        <p className="text-muted-foreground">
          Create or select an organization to view settings.
        </p>
      </div>
    );
  }

  const org = await getOrganizationById(orgId);

  if (!org) {
    return (
      <div className="py-20 text-center">
        <p className="text-muted-foreground">Organization not found.</p>
      </div>
    );
  }

  return <OrgSettingsForm org={org} />;
}
