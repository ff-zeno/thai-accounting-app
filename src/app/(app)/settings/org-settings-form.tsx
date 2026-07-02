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
import { updateOrgAction } from "@/app/(app)/actions";
import { toast } from "sonner";

const MONTHS = [
  { value: "1", label: "January", labelTh: "มกราคม" },
  { value: "2", label: "February", labelTh: "กุมภาพันธ์" },
  { value: "3", label: "March", labelTh: "มีนาคม" },
  { value: "4", label: "April", labelTh: "เมษายน" },
  { value: "5", label: "May", labelTh: "พฤษภาคม" },
  { value: "6", label: "June", labelTh: "มิถุนายน" },
  { value: "7", label: "July", labelTh: "กรกฎาคม" },
  { value: "8", label: "August", labelTh: "สิงหาคม" },
  { value: "9", label: "September", labelTh: "กันยายน" },
  { value: "10", label: "October", labelTh: "ตุลาคม" },
  { value: "11", label: "November", labelTh: "พฤศจิกายน" },
  { value: "12", label: "December", labelTh: "ธันวาคม" },
];

const DAYS = Array.from({ length: 31 }, (_, i) => ({
  value: String(i + 1),
  label: String(i + 1),
}));

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
    hasPosSales: boolean;
    hasEmployees: boolean;
    hasImportedServices: boolean;
    fiscalYearEndMonth: number | null;
    fiscalYearEndDay: number | null;
  };
}

const TAX_PROFILE_TOGGLES = [
  {
    name: "isVatRegistered",
    label: "VAT registered",
    description: "Shows the monthly PP 30 VAT return obligation.",
  },
  {
    name: "hasEmployees",
    label: "Has employees",
    description: "Shows the monthly PND 1 payroll withholding and SSO obligations.",
  },
  {
    name: "hasImportedServices",
    label: "Imports foreign services",
    description:
      "Shows the PP 36 self-assessed VAT obligation for foreign ads, software and cloud services.",
  },
  {
    name: "hasPosSales",
    label: "POS sales",
    description: "Enables point-of-sale settlement and cash-deposit tracking.",
  },
] as const;

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
                inputMode="numeric"
                defaultValue={org.taxId}
                onChange={(e) => {
                  e.target.value = e.target.value.replace(/\D/g, "").slice(0, 13);
                }}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="branchNumber">Branch Number</Label>
              <Input
                id="branchNumber"
                name="branchNumber"
                maxLength={5}
                inputMode="numeric"
                defaultValue={org.branchNumber}
                onChange={(e) => {
                  e.target.value = e.target.value.replace(/\D/g, "").slice(0, 5);
                }}
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
          <div className="space-y-4 border-t pt-4">
            <div className="space-y-1">
              <p className="text-sm font-medium">Tax profile</p>
              <p className="text-sm text-muted-foreground">
                These switches control which monthly obligations appear on
                your Compliance page.
              </p>
            </div>
            {TAX_PROFILE_TOGGLES.map((toggle) => (
              <div key={toggle.name} className="flex items-start gap-3">
                <Switch
                  id={toggle.name}
                  name={toggle.name}
                  defaultChecked={
                    toggle.name === "isVatRegistered"
                      ? (org.isVatRegistered ?? false)
                      : org[toggle.name]
                  }
                />
                <div className="space-y-0.5">
                  <Label htmlFor={toggle.name}>{toggle.label}</Label>
                  <p className="text-xs text-muted-foreground">
                    {toggle.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Fiscal Year End Month</Label>
              <Select
                name="fiscalYearEndMonth"
                defaultValue={String(org.fiscalYearEndMonth ?? 12)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MONTHS.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.label} ({m.labelTh})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Fiscal Year End Day</Label>
              <Select
                name="fiscalYearEndDay"
                defaultValue={String(org.fiscalYearEndDay ?? 31)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DAYS.map((d) => (
                    <SelectItem key={d.value} value={d.value}>
                      {d.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex justify-end">
            <Button type="submit" disabled={isPending} className="cursor-pointer">
              {isPending ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
