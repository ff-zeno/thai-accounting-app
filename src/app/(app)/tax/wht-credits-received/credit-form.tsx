"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { createWhtCreditReceivedAction } from "./actions";

interface VendorOption {
  id: string;
  name: string;
  nameTh: string | null;
}

export function WhtCreditReceivedForm({
  vendors,
}: {
  vendors: VendorOption[];
}) {
  const [isPending, startTransition] = useTransition();

  function action(formData: FormData) {
    startTransition(async () => {
      const result = await createWhtCreditReceivedAction(formData);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("WHT credit saved");
      window.location.reload();
    });
  }

  return (
    <form action={action} className="grid gap-4 md:grid-cols-2">
      <div className="space-y-1.5 md:col-span-2">
        <Label htmlFor="customerVendorId">Customer</Label>
        <NativeSelect
          id="customerVendorId"
          name="customerVendorId"
          required
          className="w-full"
        >
          <option value="">Select customer</option>
          {vendors.map((vendor) => (
            <option key={vendor.id} value={vendor.id}>
              {vendor.nameTh ? `${vendor.nameTh} / ${vendor.name}` : vendor.name}
            </option>
          ))}
        </NativeSelect>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="paymentDate">Payment date</Label>
        <Input id="paymentDate" name="paymentDate" type="date" required />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="formType">Form type</Label>
        <Input id="formType" name="formType" defaultValue="50_tawi" required />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="grossAmount">Gross amount</Label>
        <Input
          id="grossAmount"
          name="grossAmount"
          type="number"
          min="0"
          step="0.01"
          required
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="whtAmount">WHT amount</Label>
        <Input
          id="whtAmount"
          name="whtAmount"
          type="number"
          min="0"
          step="0.01"
          required
        />
      </div>

      <div className="space-y-1.5 md:col-span-2">
        <Label htmlFor="certificateNo">Certificate no.</Label>
        <Input id="certificateNo" name="certificateNo" />
      </div>

      <div className="space-y-1.5 md:col-span-2">
        <Label htmlFor="notes">Notes</Label>
        <Textarea id="notes" name="notes" />
      </div>

      <div className="md:col-span-2">
        <Button type="submit" disabled={isPending || vendors.length === 0}>
          <Plus className="mr-2 size-4" />
          Save WHT Credit
        </Button>
      </div>
    </form>
  );
}
