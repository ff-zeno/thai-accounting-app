import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "../index";
import { costCenters } from "../schema";

export async function getCostCenters(orgId: string) {
  return db
    .select()
    .from(costCenters)
    .where(and(eq(costCenters.orgId, orgId), isNull(costCenters.deletedAt)))
    .orderBy(asc(costCenters.code));
}

export async function createCostCenter(data: {
  orgId: string;
  code: string;
  nameEn: string;
  nameTh?: string;
  parentId?: string;
  isActive?: boolean;
}) {
  const [row] = await db
    .insert(costCenters)
    .values({
      orgId: data.orgId,
      code: data.code.trim().toUpperCase(),
      nameEn: data.nameEn.trim(),
      nameTh: data.nameTh?.trim() || null,
      parentId: data.parentId || null,
      isActive: data.isActive ?? true,
    })
    .returning();

  return row;
}
