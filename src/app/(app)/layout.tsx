import { redirect } from "next/navigation";
import { currentUser } from "@clerk/nextjs/server";
import { UserButton } from "@clerk/nextjs";
import { TwoTierSidebar } from "@/components/layout/two-tier-sidebar";
import { MobileDrawer } from "@/components/layout/mobile-drawer";
import { getActiveOrgId } from "@/lib/utils/org-context";
import {
  getOrganizationById,
  getOrganizationsByUserId,
  isUserMemberOfOrg,
} from "@/lib/db/queries/organizations";
import { getCurrentUser } from "@/lib/utils/auth";
import { listPins } from "@/lib/db/queries/user-nav-pins";
import { isKnownNavHref } from "@/lib/nav/pins";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { HelpSidebar } from "@/components/help/help-sidebar";
import { NoOrgGate } from "@/components/layout/no-org-gate";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const clerkUser = await currentUser();
  if (!clerkUser) {
    redirect("/sign-in");
  }

  const dbUser = await getCurrentUser();

  // User exists in Clerk but not yet synced to DB (webhook may be delayed)
  // Show the app shell with empty org list -- they can create an org
  const orgs = dbUser ? await getOrganizationsByUserId(dbUser.id) : [];

  const activeOrgId = await getActiveOrgId();

  // Validate that the active org exists AND the user has access to it
  let validActiveOrgId: string | null = null;
  if (activeOrgId && dbUser) {
    const [activeOrg, hasAccess] = await Promise.all([
      getOrganizationById(activeOrgId),
      isUserMemberOfOrg(dbUser.id, activeOrgId),
    ]);
    if (activeOrg && hasAccess) {
      validActiveOrgId = activeOrgId;
    }
  }

  const orgList = orgs.map((o) => ({
    id: o.id,
    name: o.name,
    branchNumber: o.branchNumber,
  }));

  // User nav pins — silently drop pins whose href left the nav structure.
  const pins =
    dbUser && validActiveOrgId ? await listPins(validActiveOrgId, dbUser.id) : [];
  const pinnedHrefs = pins.map((pin) => pin.href).filter(isKnownNavHref);

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Desktop sidebar */}
      <div className="hidden md:flex">
        <TwoTierSidebar
          orgs={orgList}
          activeOrgId={validActiveOrgId}
          pinnedHrefs={pinnedHrefs}
        />
      </div>

      {/* Main content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Mobile header */}
        <header className="flex h-14 items-center gap-2 border-b px-4 md:hidden">
          <MobileDrawer
            orgs={orgList}
            activeOrgId={validActiveOrgId}
            pinnedHrefs={pinnedHrefs}
          />
          <span className="text-lg font-semibold text-primary">Long Dtua</span>
          <div className="ml-auto flex items-center gap-1">
            <TooltipProvider delay={200} closeDelay={0}>
              <HelpSidebar />
            </TooltipProvider>
            <UserButton />
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-6">
          {validActiveOrgId ? children : <NoOrgGate hasOrgs={orgs.length > 0} />}
        </main>
      </div>

      <Toaster />
    </div>
  );
}
