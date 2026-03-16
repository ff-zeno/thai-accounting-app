"use client";

import { useTransition, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { createOrgAction } from "@/app/(app)/actions";

interface CreateOrgDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateOrgDialog({ open, onOpenChange }: CreateOrgDialogProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await createOrgAction(formData);
      if (result.error) {
        setError(result.error);
      } else {
        onOpenChange(false);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Create Organization</DialogTitle>
        </DialogHeader>
        <form action={handleSubmit} className="space-y-4">
          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="name">Name (English) *</Label>
              <Input id="name" name="name" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="nameTh">Name (Thai)</Label>
              <Input id="nameTh" name="nameTh" />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="taxId">Tax ID (13 digits) *</Label>
              <Input
                id="taxId"
                name="taxId"
                required
                maxLength={13}
                pattern="\d{13}"
                placeholder="0105500002383"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="branchNumber">Branch Number</Label>
              <Input
                id="branchNumber"
                name="branchNumber"
                maxLength={5}
                pattern="\d{5}"
                defaultValue="00000"
                placeholder="00000"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="registrationNo">Registration Number</Label>
            <Input id="registrationNo" name="registrationNo" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="address">Address (English)</Label>
              <Input id="address" name="address" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="addressTh">Address (Thai)</Label>
              <Input id="addressTh" name="addressTh" />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Switch id="isVatRegistered" name="isVatRegistered" />
            <Label htmlFor="isVatRegistered">VAT Registered</Label>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="fiscalYearEndMonth">Fiscal Year End Month</Label>
              <Input
                id="fiscalYearEndMonth"
                name="fiscalYearEndMonth"
                type="number"
                min={1}
                max={12}
                defaultValue={12}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="fiscalYearEndDay">Fiscal Year End Day</Label>
              <Input
                id="fiscalYearEndDay"
                name="fiscalYearEndDay"
                type="number"
                min={1}
                max={31}
                defaultValue={31}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Creating..." : "Create Organization"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
