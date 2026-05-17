import { Layers3 } from "lucide-react";
import { getCostCenters } from "@/lib/db/queries/cost-centers";
import { getActiveOrgId } from "@/lib/utils/org-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { createCostCenterAction } from "./actions";

async function submitCostCenter(formData: FormData) {
  "use server";
  await createCostCenterAction(formData);
}

export default async function CostCentersPage() {
  const orgId = await getActiveOrgId();
  const rows = orgId ? await getCostCenters(orgId) : [];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Cost Centers</h2>
        <p className="text-sm text-muted-foreground">
          Segment departments for management reporting and future allocation rules.
        </p>
      </div>

      {!orgId ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-2 py-12 text-center">
            <Layers3 className="size-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Select an organization to manage cost centers.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Create Cost Center</CardTitle>
            </CardHeader>
            <CardContent>
              <form action={submitCostCenter} className="grid gap-4 md:grid-cols-4">
                <div className="space-y-2">
                  <Label htmlFor="code">Code</Label>
                  <Input id="code" name="code" placeholder="OPS" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="nameEn">Name EN</Label>
                  <Input id="nameEn" name="nameEn" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="nameTh">Name TH</Label>
                  <Input id="nameTh" name="nameTh" />
                </div>
                <div className="flex items-end">
                  <Button type="submit">Create Cost Center</Button>
                </div>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Cost Center List</CardTitle>
            </CardHeader>
            <CardContent>
              {rows.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  No cost centers yet.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Code</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Thai name</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell className="font-mono">{row.code}</TableCell>
                        <TableCell>{row.nameEn}</TableCell>
                        <TableCell>{row.nameTh ?? "-"}</TableCell>
                        <TableCell>{row.isActive ? "Active" : "Inactive"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
