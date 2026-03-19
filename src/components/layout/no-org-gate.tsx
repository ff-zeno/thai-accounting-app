"use client";

import { useState } from "react";
import { Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CreateOrgDialog } from "./create-org-dialog";

interface NoOrgGateProps {
  hasOrgs: boolean;
}

export function NoOrgGate({ hasOrgs }: NoOrgGateProps) {
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <>
      <div className="flex flex-1 items-center justify-center">
        <div className="mx-auto max-w-md space-y-6 text-center">
          <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-muted">
            <Building2 className="size-8 text-muted-foreground" />
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-semibold">
              {hasOrgs ? "Select an Organization" : "Create Your First Organization"}
            </h2>
            <p className="text-sm text-muted-foreground">
              {hasOrgs
                ? "Use the organization switcher in the sidebar to select an organization, or create a new one."
                : "Set up your company to start managing documents, bank accounts, and tax filings."}
            </p>
          </div>
          <Button onClick={() => setDialogOpen(true)} size="lg">
            <Building2 className="mr-2 size-4" />
            Create Organization
          </Button>
        </div>
      </div>
      <CreateOrgDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </>
  );
}
