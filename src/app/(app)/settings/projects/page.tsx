import { FolderKanban } from "lucide-react";
import { getProjects } from "@/lib/db/queries/projects";
import { getVendorsByOrg } from "@/lib/db/queries/vendors";
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
import { createProjectAction } from "./actions";

const projectStatuses = ["planned", "active", "paused", "completed", "cancelled"];

async function submitProject(formData: FormData) {
  "use server";
  await createProjectAction(formData);
}

function label(value: string) {
  return value.replaceAll("_", " ");
}

export default async function ProjectsPage() {
  const orgId = await getActiveOrgId();
  const [projects, vendors] = orgId
    ? await Promise.all([getProjects(orgId), getVendorsByOrg(orgId, undefined, 100)])
    : [[], []];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Projects</h2>
        <p className="text-sm text-muted-foreground">
          Track jobs and customer projects for segmented profitability reporting.
        </p>
      </div>

      {!orgId ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-2 py-12 text-center">
            <FolderKanban className="size-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Select an organization to manage projects.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Create Project</CardTitle>
            </CardHeader>
            <CardContent>
              <form action={submitProject} className="grid gap-4 md:grid-cols-4">
                <div className="space-y-2">
                  <Label htmlFor="code">Code</Label>
                  <Input id="code" name="code" placeholder="JOB-001" required />
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
                  <Label htmlFor="customerVendorId">Customer</Label>
                  <select
                    id="customerVendorId"
                    name="customerVendorId"
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                    defaultValue=""
                  >
                    <option value="">Unassigned</option>
                    {vendors.map((vendor) => (
                      <option key={vendor.id} value={vendor.id}>
                        {vendor.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="startDate">Start date</Label>
                  <Input id="startDate" name="startDate" type="date" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="endDate">End date</Label>
                  <Input id="endDate" name="endDate" type="date" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="status">Status</Label>
                  <select
                    id="status"
                    name="status"
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                    defaultValue="active"
                  >
                    {projectStatuses.map((status) => (
                      <option key={status} value={status}>
                        {label(status)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex items-end">
                  <Button type="submit">Create Project</Button>
                </div>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Project List</CardTitle>
            </CardHeader>
            <CardContent>
              {projects.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  No projects yet.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Code</TableHead>
                      <TableHead>Project</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Dates</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {projects.map((project) => (
                      <TableRow key={project.id}>
                        <TableCell className="font-mono">{project.code}</TableCell>
                        <TableCell>
                          <div>{project.nameEn}</div>
                          {project.nameTh ? (
                            <div className="text-xs text-muted-foreground">
                              {project.nameTh}
                            </div>
                          ) : null}
                        </TableCell>
                        <TableCell>{project.customerVendorName ?? "-"}</TableCell>
                        <TableCell>
                          {[project.startDate, project.endDate].filter(Boolean).join(" to ") || "-"}
                        </TableCell>
                        <TableCell>{label(project.status)}</TableCell>
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
