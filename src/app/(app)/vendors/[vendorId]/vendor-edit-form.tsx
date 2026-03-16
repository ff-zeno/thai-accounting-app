"use client";

import { useTransition, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { updateVendorAction } from "../actions";
import { toast } from "sonner";

interface VendorEditFormProps {
  vendor: {
    id: string;
    name: string;
    nameTh: string | null;
    taxId: string | null;
    branchNumber: string | null;
    address: string | null;
    addressTh: string | null;
    email: string | null;
    paymentTermsDays: number | null;
    isVatRegistered: boolean | null;
    entityType: string;
    country: string | null;
  };
}

export function VendorEditForm({ vendor }: VendorEditFormProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await updateVendorAction(vendor.id, formData);
      if (result.error) {
        setError(result.error);
      } else {
        toast.success("Vendor updated");
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Vendor Details</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={handleSubmit} className="space-y-4">
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="name">Name (English)</Label>
              <Input id="name" name="name" required defaultValue={vendor.name} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="nameTh">Name (Thai)</Label>
              <Input id="nameTh" name="nameTh" defaultValue={vendor.nameTh ?? ""} />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="taxId">Tax ID (13 digits)</Label>
              <Input id="taxId" name="taxId" maxLength={13} defaultValue={vendor.taxId ?? ""} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="branchNumber">Branch Number</Label>
              <Input id="branchNumber" name="branchNumber" maxLength={5} defaultValue={vendor.branchNumber ?? ""} />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="entityType">Entity Type</Label>
            <Select name="entityType" defaultValue={vendor.entityType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="company">Company</SelectItem>
                <SelectItem value="individual">Individual</SelectItem>
                <SelectItem value="foreign">Foreign</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" defaultValue={vendor.email ?? ""} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="address">Address</Label>
              <Input id="address" name="address" defaultValue={vendor.address ?? ""} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="addressTh">Address (Thai)</Label>
              <Input id="addressTh" name="addressTh" defaultValue={vendor.addressTh ?? ""} />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="paymentTermsDays">Payment Terms (days)</Label>
              <Input id="paymentTermsDays" name="paymentTermsDays" type="number" defaultValue={vendor.paymentTermsDays ?? ""} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="country">Country</Label>
              <Input id="country" name="country" defaultValue={vendor.country ?? "TH"} />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Switch id="isVatRegistered" name="isVatRegistered" defaultChecked={vendor.isVatRegistered ?? false} />
            <Label htmlFor="isVatRegistered">VAT Registered</Label>
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
