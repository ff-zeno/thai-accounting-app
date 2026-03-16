"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Plus, Search, Users, Trash2 } from "lucide-react";
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
      <Badge variant="secondary" className="text-xs capitalize">
        {row.getValue("entityType")}
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
      className="size-7 text-muted-foreground hover:text-destructive"
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

export function VendorList({ vendors }: { vendors: Vendor[] }) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [globalFilter, setGlobalFilter] = useState("");

  const table = useReactTable({
    data: vendors,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onGlobalFilterChange: setGlobalFilter,
    state: { globalFilter },
  });

  function handleCreate(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await createVendorAction(formData);
      if (result.error) {
        setError(result.error);
      } else {
        setDialogOpen(false);
        toast.success("Vendor created");
      }
    });
  }

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
        <Button onClick={() => setDialogOpen(true)}>
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
                  <Users className="mx-auto mb-2 size-8" />
                  No vendors yet. Add your first vendor.
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
          <form action={handleCreate} className="space-y-4">
            {error && <p className="text-sm text-destructive">{error}</p>}
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
                <Label htmlFor="taxId">Tax ID (13 digits)</Label>
                <Input id="taxId" name="taxId" maxLength={13} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="branchNumber">Branch Number</Label>
                <Input
                  id="branchNumber"
                  name="branchNumber"
                  maxLength={5}
                  placeholder="00000"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="entityType">Entity Type</Label>
              <Select name="entityType" defaultValue="company">
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
              <Input id="email" name="email" type="email" />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="address">Address</Label>
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
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? "Creating..." : "Add Vendor"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
