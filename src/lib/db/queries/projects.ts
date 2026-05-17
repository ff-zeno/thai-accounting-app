import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "../index";
import { projects, vendors } from "../schema";

export async function getProjects(orgId: string) {
  return db
    .select({
      id: projects.id,
      code: projects.code,
      nameEn: projects.nameEn,
      nameTh: projects.nameTh,
      customerVendorId: projects.customerVendorId,
      customerVendorName: vendors.name,
      startDate: projects.startDate,
      endDate: projects.endDate,
      status: projects.status,
      isActive: projects.isActive,
      createdAt: projects.createdAt,
      updatedAt: projects.updatedAt,
    })
    .from(projects)
    .leftJoin(
      vendors,
      and(eq(vendors.id, projects.customerVendorId), eq(vendors.orgId, projects.orgId))
    )
    .where(and(eq(projects.orgId, orgId), isNull(projects.deletedAt)))
    .orderBy(asc(projects.code));
}

export async function createProject(data: {
  orgId: string;
  code: string;
  nameEn: string;
  nameTh?: string;
  customerVendorId?: string;
  startDate?: string;
  endDate?: string;
  status?: "planned" | "active" | "paused" | "completed" | "cancelled";
  isActive?: boolean;
}) {
  const [row] = await db
    .insert(projects)
    .values({
      orgId: data.orgId,
      code: data.code.trim().toUpperCase(),
      nameEn: data.nameEn.trim(),
      nameTh: data.nameTh?.trim() || null,
      customerVendorId: data.customerVendorId || null,
      startDate: data.startDate || null,
      endDate: data.endDate || null,
      status: data.status ?? "active",
      isActive: data.isActive ?? true,
    })
    .returning();

  return row;
}
