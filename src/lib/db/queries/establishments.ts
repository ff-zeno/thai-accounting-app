import { and, eq, isNull, sql } from "drizzle-orm";
import { db, type DbConnection } from "../index";
import { establishments, organizations } from "../schema";
import { orgScopeAlive } from "../helpers/org-scope";

/**
 * Places of business ("สถานประกอบการ"). Every VAT filing is per-establishment:
 * PP30 and the statutory output/input tax reports carry the branch number, and
 * "00000" is the head office every org must have.
 */

export async function ensureHeadOfficeEstablishment(
  orgId: string,
  tx: DbConnection = db
) {
  const [existing] = await tx
    .select()
    .from(establishments)
    .where(
      and(
        ...orgScopeAlive(establishments, orgId),
        eq(establishments.branchNumber, "00000")
      )
    )
    .limit(1);

  if (existing) return existing;

  const [org] = await tx
    .select()
    .from(organizations)
    .where(and(eq(organizations.id, orgId), isNull(organizations.deletedAt)))
    .limit(1);

  if (!org) throw new Error("Organization not found");

  const [created] = await tx
    .insert(establishments)
    .values({
      orgId,
      branchNumber: "00000",
      nameEn: "Head Office",
      nameTh: "สำนักงานใหญ่",
      isHeadOffice: true,
      vatRegistered: org.isVatRegistered ?? true,
      taxId: org.taxId,
    })
    .onConflictDoUpdate({
      target: [establishments.orgId, establishments.branchNumber],
      set: {
        isHeadOffice: true,
        vatRegistered: sql`EXCLUDED.vat_registered`,
        taxId: sql`EXCLUDED.tax_id`,
      },
      setWhere: sql`${establishments.orgId} = EXCLUDED.org_id`,
    })
    .returning();

  return created;
}

/** Head office first (branch "00000" sorts lowest), then branches in order. */
export async function listEstablishments(orgId: string) {
  await ensureHeadOfficeEstablishment(orgId);
  return db
    .select()
    .from(establishments)
    .where(and(...orgScopeAlive(establishments, orgId)))
    .orderBy(establishments.branchNumber);
}
