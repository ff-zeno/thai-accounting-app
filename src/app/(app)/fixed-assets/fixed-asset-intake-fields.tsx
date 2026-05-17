"use client";

import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type CategoryDefault = {
  category: string;
  taxUsefulLifeMonthsMinimum: number;
};

function label(value: string) {
  return value.replaceAll("_", " ");
}

export function FixedAssetIntakeFields({
  categoryDefaults,
}: {
  categoryDefaults: CategoryDefault[];
}) {
  const [category, setCategory] = useState(
    categoryDefaults[0]?.category ?? "equipment"
  );
  const [usefulLifeMonths, setUsefulLifeMonths] = useState("60");
  const selected = useMemo(
    () => categoryDefaults.find((row) => row.category === category),
    [category, categoryDefaults]
  );
  const bookLife = Number.parseInt(usefulLifeMonths, 10);
  const taxMinimum = selected?.taxUsefulLifeMonthsMinimum ?? 0;
  const belowTaxMinimum =
    Number.isInteger(bookLife) && bookLife > 0 && taxMinimum > 0 && bookLife < taxMinimum;

  return (
    <>
      <div className="space-y-2">
        <Label htmlFor="assetCode">Asset code</Label>
        <Input id="assetCode" name="assetCode" placeholder="auto" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="nameEn">Name EN</Label>
        <Input id="nameEn" name="nameEn" required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="nameTh">Name TH</Label>
        <Input id="nameTh" name="nameTh" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="category">Category</Label>
        <select
          id="category"
          name="category"
          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
          value={category}
          onChange={(event) => setCategory(event.target.value)}
        >
          {categoryDefaults.map((row) => (
            <option key={row.category} value={row.category}>
              {label(row.category)}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="acquisitionDate">Acquisition date</Label>
        <Input id="acquisitionDate" name="acquisitionDate" type="date" required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="originalCost">Original cost</Label>
        <Input id="originalCost" name="originalCost" inputMode="decimal" required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="salvageValue">Salvage value</Label>
        <Input
          id="salvageValue"
          name="salvageValue"
          inputMode="decimal"
          defaultValue="0.00"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="usefulLifeMonths">Book life months</Label>
        <Input
          id="usefulLifeMonths"
          name="usefulLifeMonths"
          inputMode="numeric"
          value={usefulLifeMonths}
          onChange={(event) => setUsefulLifeMonths(event.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="depreciationStartDate">Depreciation start</Label>
        <Input id="depreciationStartDate" name="depreciationStartDate" type="date" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="serialNumber">Serial</Label>
        <Input id="serialNumber" name="serialNumber" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="location">Location</Label>
        <Input id="location" name="location" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="notes">Notes</Label>
        <Input id="notes" name="notes" />
      </div>
      <div className="md:col-span-4">
        <div className="rounded-md border px-3 py-2 text-sm text-muted-foreground">
          Tax minimum for {label(category)}: {taxMinimum} months.
          {belowTaxMinimum ? (
            <span className="block text-amber-700">
              Book life is shorter than the tax minimum. The excess book depreciation is
              tracked as a PND.50 addback.
            </span>
          ) : null}
        </div>
      </div>
    </>
  );
}
