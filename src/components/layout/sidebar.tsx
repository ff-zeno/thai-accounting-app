"use client";

import { useState } from "react";
import { OrgSwitcher } from "./org-switcher";
import { SidebarNav } from "./sidebar-nav";
import { CreateOrgDialog } from "./create-org-dialog";
import { Separator } from "@/components/ui/separator";

interface Org {
  id: string;
  name: string;
  branchNumber: string;
}

interface SidebarProps {
  orgs: Org[];
  activeOrgId: string | null;
}

export function Sidebar({ orgs, activeOrgId }: SidebarProps) {
  const [createDialogOpen, setCreateDialogOpen] = useState(false);

  return (
    <>
      <aside className="flex h-full w-64 flex-col border-r bg-sidebar">
        <div className="p-4">
          <h1 className="mb-3 text-lg font-semibold tracking-tight">
            Thai Accounting
          </h1>
          <OrgSwitcher
            orgs={orgs}
            activeOrgId={activeOrgId}
            onCreateNew={() => setCreateDialogOpen(true)}
          />
        </div>
        <Separator />
        <SidebarNav />
      </aside>
      <CreateOrgDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
      />
    </>
  );
}
