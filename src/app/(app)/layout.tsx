import { redirect } from "next/navigation";
import { currentUser } from "@clerk/nextjs/server";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { TopBar } from "@/components/layout/top-bar";
import { MobileTabBar } from "@/components/layout/mobile-tab-bar";
import { getActiveOrgId } from "@/lib/utils/org-context";
import {
  getOrganizationById,
  getOrganizationsByUserId,
  isUserMemberOfOrg,
} from "@/lib/db/queries/organizations";
import { getCurrentUser } from "@/lib/utils/auth";
import { getNavBadges } from "@/lib/nav/badges";
import { Toaster } from "@/components/ui/sonner";
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

  // Advisory badges — refreshed per navigation, never polled.
  const badges = validActiveOrgId
    ? await getNavBadges(validActiveOrgId)
    : undefined;

  return (
    <div className="flex h-screen overflow-hidden">
      <div className="hidden md:flex">
        <AppSidebar
          orgs={orgList}
          activeOrgId={validActiveOrgId}
          badges={badges}
        />
      </div>

      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar />
        <main className="flex-1 overflow-y-auto p-4 pb-20 md:p-6 md:pb-6">
          {validActiveOrgId ? children : <NoOrgGate hasOrgs={orgs.length > 0} />}
        </main>
      </div>

      <MobileTabBar
        orgs={orgList}
        activeOrgId={validActiveOrgId}
      />

      <Toaster />
    </div>
  );
}
