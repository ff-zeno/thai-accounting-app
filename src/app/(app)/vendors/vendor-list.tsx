"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Plus, Search, Users, Trash2, Languages } from "lucide-react";
import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  flexRender,
  type ColumnDef,
} from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createVendorAction, deleteVendorAction } from "./actions";
import { toast } from "sonner";
import { validateName, validateTaxId, validateEmail, validateAddress } from "@/lib/utils/validators";

// ---------------------------------------------------------------------------
// Entity type display helper
// ---------------------------------------------------------------------------

const ENTITY_TYPES = [
  { value: "company", label: "Company" },
  { value: "individual", label: "Individual" },
  { value: "foreign", label: "Foreign" },
] as const;

function entityTypeLabel(value: string) {
  return ENTITY_TYPES.find((e) => e.value === value)?.label ?? value;
}

// ---------------------------------------------------------------------------
// Table
// ---------------------------------------------------------------------------

interface Vendor {
  id: string;
  name: string;
  nameTh: string | null;
  taxId: string | null;
  branchNumber: string | null;
  entityType: string;
  isVatRegistered: boolean | null;
  email: string | null;
}

const columns: ColumnDef<Vendor>[] = [
  {
    accessorKey: "name",
    header: "Name",
    cell: ({ row }) => (
      <Link
        href={`/vendors/${row.original.id}`}
        className="font-medium hover:underline"
      >
        {row.getValue("name")}
        {row.original.nameTh && (
          <span className="ml-1 text-muted-foreground">
            ({row.original.nameTh})
          </span>
        )}
      </Link>
    ),
  },
  {
    accessorKey: "taxId",
    header: "Tax ID",
    cell: ({ row }) => (
      <span className="font-mono text-sm">
        {row.getValue("taxId") ?? "—"}
      </span>
    ),
  },
  {
    accessorKey: "entityType",
    header: "Type",
    cell: ({ row }) => (
      <Badge variant="secondary" className="text-xs">
        {entityTypeLabel(row.getValue("entityType"))}
      </Badge>
    ),
  },
  {
    accessorKey: "isVatRegistered",
    header: "VAT",
    cell: ({ row }) =>
      row.getValue("isVatRegistered") ? (
        <Badge className="text-xs">VAT</Badge>
      ) : (
        <span className="text-xs text-muted-foreground">—</span>
      ),
  },
  {
    id: "actions",
    cell: ({ row }) => <DeleteButton vendorId={row.original.id} />,
  },
];

function DeleteButton({ vendorId }: { vendorId: string }) {
  const [isPending, startTransition] = useTransition();
  return (
    <Button
      variant="ghost"
      size="icon"
      className="size-7 cursor-pointer text-muted-foreground hover:text-destructive"
      disabled={isPending}
      onClick={() => {
        startTransition(async () => {
          await deleteVendorAction(vendorId);
          toast.success("Vendor deleted");
        });
      }}
    >
      <Trash2 className="size-3.5" />
    </Button>
  );
}

// ---------------------------------------------------------------------------
// Translate button (calls server-side translate)
// ---------------------------------------------------------------------------

function TranslateButton({
  from,
  onTranslated,
}: {
  from: string;
  onTranslated: (text: string) => void;
}) {
  const [isPending, startTransition] = useTransition();

  async function handleTranslate() {
    if (!from.trim()) return;
    startTransition(async () => {
      try {
        // Use a simple fetch to the translate endpoint
        // For now, just indicate translation is not yet wired
        toast.info("Translation will be available when AI models are configured");
      } catch {
        toast.error("Translation failed");
      }
    });
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      className="cursor-pointer"
      onClick={handleTranslate}
      disabled={isPending || !from.trim()}
      title="Translate"
    >
      <Languages className="size-3.5" />
    </Button>
  );
}

// ---------------------------------------------------------------------------
// Create vendor form
// ---------------------------------------------------------------------------

function CreateVendorForm({
  onSuccess,
  onCancel,
}: {
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [primaryLang, setPrimaryLang] = useState<"th" | "en">("th");
  const [nameField, setNameField] = useState("");
  const [nameSecondary, setNameSecondary] = useState("");
  const [taxId, setTaxId] = useState("");

  function handleCreate(formData: FormData) {
    setError(null);

    // Determine which field is name vs nameTh based on primary language
    const name = primaryLang === "en" ? nameField : nameSecondary;
    const nameTh = primaryLang === "th" ? nameField : nameSecondary;

    // Client-side validation
    const primaryVal = primaryLang === "th" ? nameTh : name;
    if (!primaryVal.trim()) {
      setError("Name is required");
      return;
    }
    if (primaryVal) {
      const v = validateName(primaryVal);
      if (!v.valid) { setError(v.message!); return; }
    }
    if (name) {
      const v = validateName(name);
      if (!v.valid) { setError(`English name: ${v.message}`); return; }
    }
    if (taxId) {
      const v = validateTaxId(taxId);
      if (!v.valid) { setError(v.message!); return; }
    }
    const email = formData.get("email") as string;
    if (email) {
      const v = validateEmail(email);
      if (!v.valid) { setError(v.message!); return; }
    }
    const address = formData.get("address") as string;
    if (address) {
      const v = validateAddress(address);
      if (!v.valid) { setError(`Address: ${v.message}`); return; }
    }

    // Set the resolved values into formData
    formData.set("name", name || primaryVal);
    formData.set("nameTh", nameTh);
    formData.set("taxId", taxId);

    startTransition(async () => {
      const result = await createVendorAction(formData);
      if (result.error) {
        setError(result.error);
      } else {
        onSuccess();
        toast.success("Vendor created");
      }
    });
  }

  const primaryLabel = primaryLang === "th" ? "ชื่อ (Thai)" : "Name (English)";
  const secondaryLabel = primaryLang === "th" ? "Name (English)" : "ชื่อ (Thai)";

  return (
    <form action={handleCreate} className="space-y-4">
      {error && <p className="text-sm text-destructive">{error}</p>}

      {/* Language toggle */}
      <div className="flex items-center justify-between rounded-md bg-muted/50 p-2">
        <span className="text-xs font-medium text-muted-foreground">
          Primary language
        </span>
        <div className="flex gap-1">
          <Button
            type="button"
            size="xs"
            variant={primaryLang === "th" ? "default" : "outline"}
            className="cursor-pointer"
            onClick={() => setPrimaryLang("th")}
          >
            ไทย
          </Button>
          <Button
            type="button"
            size="xs"
            variant={primaryLang === "en" ? "default" : "outline"}
            className="cursor-pointer"
            onClick={() => setPrimaryLang("en")}
          >
            EN
          </Button>
        </div>
      </div>

      {/* Name fields */}
      <div className="space-y-3">
        <div className="space-y-2">
          <Label>{primaryLabel} *</Label>
          <Input
            value={nameField}
            onChange={(e) => setNameField(e.target.value)}
            required
            placeholder={primaryLang === "th" ? "บริษัท ..." : "Company name..."}
          />
        </div>
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Label className="flex-1">{secondaryLabel}</Label>
            <TranslateButton
              from={nameField}
              onTranslated={setNameSecondary}
            />
          </div>
          <Input
            value={nameSecondary}
            onChange={(e) => setNameSecondary(e.target.value)}
            placeholder={primaryLang === "th" ? "English name..." : "ชื่อภาษาไทย..."}
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Tax ID (13 digits)</Label>
          <Input
            value={taxId}
            onChange={(e) => {
              // Only allow digits
              const v = e.target.value.replace(/\D/g, "").slice(0, 13);
              setTaxId(v);
            }}
            maxLength={13}
            inputMode="numeric"
            placeholder="0105500002383"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="branchNumber">Branch Number</Label>
          <Input
            id="branchNumber"
            name="branchNumber"
            maxLength={5}
            inputMode="numeric"
            placeholder="00000"
            onChange={(e) => {
              e.target.value = e.target.value.replace(/\D/g, "").slice(0, 5);
            }}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="entityType">Entity Type</Label>
        <Select name="entityType" defaultValue="company">
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ENTITY_TYPES.map((et) => (
              <SelectItem key={et.value} value={et.value}>
                {et.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" />
      </div>

      {/* Address fields with translate */}
      <div className="space-y-3">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Label className="flex-1">
              {primaryLang === "th" ? "ที่อยู่ (Thai)" : "Address (English)"}
            </Label>
          </div>
          <Input
            name={primaryLang === "th" ? "addressTh" : "address"}
            placeholder={primaryLang === "th" ? "ที่อยู่..." : "Address..."}
          />
        </div>
        <div className="space-y-2">
          <Label>
            {primaryLang === "th" ? "Address (English)" : "ที่อยู่ (Thai)"}
          </Label>
          <Input
            name={primaryLang === "th" ? "address" : "addressTh"}
            placeholder={primaryLang === "th" ? "Address..." : "ที่อยู่..."}
          />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Switch id="isVatRegistered" name="isVatRegistered" />
        <Label htmlFor="isVatRegistered">VAT Registered</Label>
      </div>

      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          className="cursor-pointer"
          onClick={onCancel}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={isPending} className="cursor-pointer">
          {isPending ? "Creating..." : "Add Vendor"}
        </Button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function VendorList({ vendors }: { vendors: Vendor[] }) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [globalFilter, setGlobalFilter] = useState("");

  const table = useReactTable({
    data: vendors,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onGlobalFilterChange: setGlobalFilter,
    state: { globalFilter },
  });

  return (
    <>
      <div className="flex items-center gap-2">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search vendors..."
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button onClick={() => setDialogOpen(true)} className="cursor-pointer">
          <Plus className="mr-1 size-4" />
          Add Vendor
        </Button>
      </div>

      <div className="rounded-md border">
        <table className="w-full">
          <thead>
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id} className="border-b bg-muted/50">
                {hg.headers.map((header) => (
                  <th
                    key={header.id}
                    className="px-3 py-2 text-left text-xs font-medium text-muted-foreground"
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="py-8 text-center text-sm text-muted-foreground"
                >
                  <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-full bg-primary/10">
                    <Users className="size-6 text-primary" />
                  </div>
                  <p className="font-medium text-foreground">No vendors yet</p>
                  <p className="mt-1">Add your first vendor to get started.</p>
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row) => (
                <tr key={row.id} className="border-b last:border-0">
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-3 py-2">
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Vendor</DialogTitle>
          </DialogHeader>
          <CreateVendorForm
            onSuccess={() => setDialogOpen(false)}
            onCancel={() => setDialogOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
