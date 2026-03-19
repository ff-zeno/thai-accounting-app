import { Sidebar } from "@/components/layout/sidebar";
import { MobileSidebar } from "@/components/layout/mobile-sidebar";
import { getActiveOrgId } from "@/lib/utils/org-context";
import { getAllOrganizations, getOrganizationById } from "@/lib/db/queries/organizations";
import { Toaster } from "@/components/ui/sonner";
import { NoOrgGate } from "@/components/layout/no-org-gate";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [orgs, activeOrgId] = await Promise.all([
    getAllOrganizations(),
    getActiveOrgId(),
  ]);

  // Validate that the active org actually exists
  const activeOrg = activeOrgId ? await getOrganizationById(activeOrgId) : null;
  const validActiveOrgId = activeOrg ? activeOrgId : null;

  const orgList = orgs.map((o) => ({
    id: o.id,
    name: o.name,
    branchNumber: o.branchNumber,
  }));

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Desktop sidebar */}
      <div className="hidden md:block">
        <Sidebar orgs={orgList} activeOrgId={validActiveOrgId} />
      </div>

      {/* Main content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Mobile header */}
        <header className="flex h-14 items-center gap-2 border-b px-4 md:hidden">
          <MobileSidebar orgs={orgList} activeOrgId={validActiveOrgId} />
          <span className="text-lg font-semibold">Thai Accounting</span>
        </header>

        <main className="flex-1 overflow-y-auto p-6">
          {validActiveOrgId ? children : <NoOrgGate hasOrgs={orgs.length > 0} />}
        </main>
      </div>

      <Toaster />
    </div>
  );
}
