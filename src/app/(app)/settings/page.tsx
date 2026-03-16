import { getActiveOrgId } from "@/lib/utils/org-context";
import { getOrganizationById } from "@/lib/db/queries/organizations";
import { OrgSettingsForm } from "./org-settings-form";

export default async function SettingsPage() {
  const orgId = await getActiveOrgId();

  if (!orgId) {
    return (
      <div className="py-20 text-center">
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="mt-2 text-muted-foreground">
          Create or select an organization to view settings.
        </p>
      </div>
    );
  }

  const org = await getOrganizationById(orgId);

  if (!org) {
    return (
      <div className="py-20 text-center">
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="mt-2 text-muted-foreground">Organization not found.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-semibold">Organization Settings</h1>
      <OrgSettingsForm org={org} />
    </div>
  );
}
