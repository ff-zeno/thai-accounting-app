"use client";

import { useTransition } from "react";
import { Building2, ChevronsUpDown, Plus } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { switchOrgAction } from "@/app/(app)/actions";

interface Org {
  id: string;
  name: string;
  branchNumber: string;
}

interface OrgSwitcherProps {
  orgs: Org[];
  activeOrgId: string | null;
  onCreateNew: () => void;
}

export function OrgSwitcher({
  orgs,
  activeOrgId,
  onCreateNew,
}: OrgSwitcherProps) {
  const [isPending, startTransition] = useTransition();
  const activeOrg = orgs.find((o) => o.id === activeOrgId);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="flex w-full cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-accent disabled:opacity-50"
        disabled={isPending}
      >
        <Building2 className="size-4 shrink-0" />
        <span className="flex-1 truncate text-left">
          {activeOrg?.name ?? "Select organization"}
        </span>
        <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-[240px]">
        {orgs.map((org) => (
          <DropdownMenuItem
            key={org.id}
            onClick={() => {
              if (org.id !== activeOrgId) {
                startTransition(() => switchOrgAction(org.id));
              }
            }}
            className="flex items-center gap-2"
          >
            <Building2 className="size-4 shrink-0" />
            <div className="flex-1 truncate">
              <p className="truncate text-sm font-medium">{org.name}</p>
              {org.branchNumber !== "00000" && (
                <p className="text-xs text-muted-foreground">
                  Branch {org.branchNumber}
                </p>
              )}
            </div>
            {org.id === activeOrgId && (
              <span className="size-2 rounded-full bg-primary" />
            )}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onCreateNew} className="gap-2">
          <Plus className="size-4" />
          Create new organization
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
