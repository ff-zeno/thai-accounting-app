import { getAllocationRules } from "@/lib/db/queries/allocation-rules";
import { getCostCenters } from "@/lib/db/queries/cost-centers";
import { getProjects } from "@/lib/db/queries/projects";
import { getActiveOrgId } from "@/lib/utils/org-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, NoOrgState } from "@/components/ui/empty-state";
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
import { createAllocationRuleAction } from "./actions";

async function submitAllocationRule(formData: FormData) {
  "use server";
  await createAllocationRuleAction(formData);
}

function pct(value: string) {
  return `${(Number(value) * 100).toFixed(0)}%`;
}

function label(value: string) {
  return value.replaceAll("_", " ");
}

export default async function AllocationRulesPage({
  searchParams,
}: {
  searchParams?: Promise<{ error?: string; status?: string }>;
}) {
  const orgId = await getActiveOrgId();
  const messages = searchParams ? await searchParams : {};
  const [rules, costCenters, projects] = orgId
    ? await Promise.all([
        getAllocationRules(orgId),
        getCostCenters(orgId),
        getProjects(orgId),
      ])
    : [[], [], []];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Allocation Rules</h2>
        <p className="text-sm text-muted-foreground">
          Configure simple split rules for shared costs before segmented P&L posting.
        </p>
      </div>

      {messages.error ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {messages.error}
        </div>
      ) : null}
      {messages.status ? (
        <div className="rounded-md border border-success/40 bg-success/10 px-3 py-2 text-sm text-success">
          {messages.status}
        </div>
      ) : null}

      {!orgId ? (
        <Card>
          <CardContent>
            <NoOrgState>Select an organization to manage allocation rules.</NoOrgState>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Create Split Rule</CardTitle>
            </CardHeader>
            <CardContent>
              <form action={submitAllocationRule} className="grid gap-4 md:grid-cols-4">
                <div className="space-y-2">
                  <Label htmlFor="ruleName">Rule name</Label>
                  <Input id="ruleName" name="ruleName" placeholder="Rent split" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="sourceType">Source type</Label>
                  <select id="sourceType" name="sourceType" className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm" defaultValue="category">
                    <option value="category">Category</option>
                    <option value="vendor">Vendor</option>
                    <option value="gl_account">GL account</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="sourceId">Source value</Label>
                  <Input id="sourceId" name="sourceId" placeholder="category key or UUID" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="effectiveFrom">Effective from</Label>
                  <Input id="effectiveFrom" name="effectiveFrom" type="date" />
                </div>
                {[1, 2].map((index) => (
                  <div key={index} className="grid gap-4 rounded-md border p-3 md:col-span-4 md:grid-cols-5">
                    <div className="space-y-2">
                      <Label htmlFor={`target${index}CostCenterId`}>Target {index} cost center</Label>
                      <select id={`target${index}CostCenterId`} name={`target${index}CostCenterId`} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm" defaultValue="">
                        <option value="">None</option>
                        {costCenters.map((costCenter) => (
                          <option key={costCenter.id} value={costCenter.id}>
                            {costCenter.code} {costCenter.nameEn}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor={`target${index}ProjectId`}>Project</Label>
                      <select id={`target${index}ProjectId`} name={`target${index}ProjectId`} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm" defaultValue="">
                        <option value="">None</option>
                        {projects.map((project) => (
                          <option key={project.id} value={project.id}>
                            {project.code} {project.nameEn}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor={`target${index}Percentage`}>Percentage</Label>
                      <Input id={`target${index}Percentage`} name={`target${index}Percentage`} inputMode="decimal" placeholder={index === 1 ? "0.6000" : "0.4000"} required={index === 1} />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <Label htmlFor={`target${index}Notes`}>Notes</Label>
                      <Input id={`target${index}Notes`} name={`target${index}Notes`} />
                    </div>
                  </div>
                ))}
                <div className="md:col-span-4">
                  <Button type="submit">Create Allocation Rule</Button>
                </div>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Rule List</CardTitle>
            </CardHeader>
            <CardContent>
              {rules.length === 0 ? (
                <EmptyState size="sm" title="No allocation rules yet." />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Rule</TableHead>
                      <TableHead>Source</TableHead>
                      <TableHead>Targets</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rules.map((rule) => (
                      <TableRow key={rule.id}>
                        <TableCell>{rule.ruleName}</TableCell>
                        <TableCell>
                          {label(rule.sourceType)}
                          {(rule.sourceKey ?? rule.sourceId) ? (
                            <div className="text-xs text-muted-foreground">
                              {rule.sourceKey ?? rule.sourceId}
                            </div>
                          ) : null}
                        </TableCell>
                        <TableCell>
                          {rule.targets.map((target) => (
                            <div key={target.id} className="text-sm">
                              {pct(target.percentage)}{" "}
                              {target.costCenterCode ?? target.projectCode ?? "Unassigned"}{" "}
                              {target.costCenterName ?? target.projectName ?? ""}
                            </div>
                          ))}
                        </TableCell>
                        <TableCell>{rule.isActive ? "Active" : "Inactive"}</TableCell>
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
