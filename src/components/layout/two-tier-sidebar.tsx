"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { LocaleSwitcher } from "./locale-switcher";
import { OrgSwitcher } from "./org-switcher";
import { CreateOrgDialog } from "./create-org-dialog";
import { Tier1IconStrip } from "./tier1-icon-strip";
import { Tier2TextPanel } from "./tier2-text-panel";
import { Separator } from "@/components/ui/separator";
import {
  getActiveNavCategory,
  navCategories,
} from "@/lib/nav/structure";

interface Org {
  id: string;
  name: string;
  branchNumber: string;
}

interface TwoTierSidebarProps {
  orgs: Org[];
  activeOrgId: string | null;
  pinnedHrefs: string[];
}

export function TwoTierSidebar({
  orgs,
  activeOrgId,
  pinnedHrefs,
}: TwoTierSidebarProps) {
  const pathname = usePathname();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const activeCategory = getActiveNavCategory(pathname);

  return (
    <>
      <aside className="flex h-full w-[304px] border-r bg-background">
        <Tier1IconStrip
          categories={navCategories}
          activeCategory={activeCategory}
        />

        <div className="flex min-w-0 flex-1 flex-col bg-sidebar">
          <div className="p-3">
            <div className="mb-3 flex items-center gap-2.5 text-primary">
              <span className="text-lg font-semibold tracking-tight">
                Long Dtua
              </span>
            </div>
            <OrgSwitcher
              orgs={orgs}
              activeOrgId={activeOrgId}
              onCreateNew={() => setCreateDialogOpen(true)}
            />
          </div>
          <Separator />
          <Tier2TextPanel
            category={activeCategory}
            pathname={pathname}
            pinnedHrefs={pinnedHrefs}
          />
          <Separator />
          <div className="space-y-3 p-3">
            <LocaleSwitcher />
          </div>
        </div>
      </aside>

      <CreateOrgDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
      />
    </>
  );
}
