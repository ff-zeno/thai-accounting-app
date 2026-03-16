"use client";

import { useState } from "react";
import { Menu } from "lucide-react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Sidebar } from "./sidebar";

interface Org {
  id: string;
  name: string;
  branchNumber: string;
}

interface MobileSidebarProps {
  orgs: Org[];
  activeOrgId: string | null;
}

export function MobileSidebar({ orgs, activeOrgId }: MobileSidebarProps) {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger className="inline-flex items-center justify-center rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-accent-foreground md:hidden">
        <Menu className="size-5" />
        <span className="sr-only">Toggle menu</span>
      </SheetTrigger>
      <SheetContent side="left" className="w-64 p-0" showCloseButton={false}>
        <Sidebar orgs={orgs} activeOrgId={activeOrgId} />
      </SheetContent>
    </Sheet>
  );
}
