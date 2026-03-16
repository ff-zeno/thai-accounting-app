"use client";

import { useTransition, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { updateOrgAction } from "@/app/(app)/actions";
import { toast } from "sonner";

interface OrgSettingsFormProps {
  org: {
    id: string;
    name: string;
    nameTh: string | null;
    taxId: string;
    branchNumber: string;
    registrationNo: string | null;
    address: string | null;
    addressTh: string | null;
    isVatRegistered: boolean | null;
    fiscalYearEndMonth: number | null;
    fiscalYearEndDay: number | null;
  };
}

export function OrgSettingsForm({ org }: OrgSettingsFormProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await updateOrgAction(org.id, formData);
      if (result.error) {
        setError(result.error);
      } else {
        toast.success("Organization updated");
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Organization Details</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={handleSubmit} className="space-y-4">
          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="name">Name (English)</Label>
              <Input id="name" name="name" required defaultValue={org.name} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="nameTh">Name (Thai)</Label>
              <Input
                id="nameTh"
                name="nameTh"
                defaultValue={org.nameTh ?? ""}
              />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="taxId">Tax ID (13 digits)</Label>
              <Input
                id="taxId"
                name="taxId"
                required
                maxLength={13}
                pattern="\d{13}"
                defaultValue={org.taxId}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="branchNumber">Branch Number</Label>
              <Input
                id="branchNumber"
                name="branchNumber"
                maxLength={5}
                pattern="\d{5}"
                defaultValue={org.branchNumber}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="registrationNo">Registration Number</Label>
            <Input
              id="registrationNo"
              name="registrationNo"
              defaultValue={org.registrationNo ?? ""}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="address">Address (English)</Label>
              <Input
                id="address"
                name="address"
                defaultValue={org.address ?? ""}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="addressTh">Address (Thai)</Label>
              <Input
                id="addressTh"
                name="addressTh"
                defaultValue={org.addressTh ?? ""}
              />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Switch
              id="isVatRegistered"
              name="isVatRegistered"
              defaultChecked={org.isVatRegistered ?? false}
            />
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
                defaultValue={org.fiscalYearEndMonth ?? 12}
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
                defaultValue={org.fiscalYearEndDay ?? 31}
              />
            </div>
          </div>
          <div className="flex justify-end">
            <Button type="submit" disabled={isPending}>
              {isPending ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
