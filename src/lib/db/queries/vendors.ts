import { and, eq, isNull, like, or, desc } from "drizzle-orm";
import { db } from "../index";
import { vendors } from "../schema";

export async function getVendorsByOrg(
  orgId: string,
  search?: string,
  limit = 50,
  offset = 0
) {
  const conditions = [
    eq(vendors.orgId, orgId),
    isNull(vendors.deletedAt),
  ];

  if (search) {
    const pattern = `%${search}%`;
    conditions.push(
      or(
        like(vendors.name, pattern),
        like(vendors.nameTh, pattern),
        like(vendors.taxId, pattern)
      )!
    );
  }

  return db
    .select()
    .from(vendors)
    .where(and(...conditions))
    .orderBy(desc(vendors.createdAt))
    .limit(limit)
    .offset(offset);
}

export async function getVendorById(orgId: string, id: string) {
  const results = await db
    .select()
    .from(vendors)
    .where(
      and(
        eq(vendors.id, id),
        eq(vendors.orgId, orgId),
        isNull(vendors.deletedAt)
      )
    )
    .limit(1);
  return results[0] ?? null;
}

export async function createVendor(data: {
  orgId: string;
  name: string;
  nameTh?: string | null;
  taxId?: string | null;
  branchNumber?: string | null;
  address?: string | null;
  addressTh?: string | null;
  email?: string | null;
  paymentTermsDays?: number | null;
  isVatRegistered?: boolean | null;
  entityType: "individual" | "company" | "foreign";
  country?: string;
}) {
  const [vendor] = await db.insert(vendors).values(data).returning();
  return vendor;
}

export async function updateVendor(
  orgId: string,
  id: string,
  data: {
    name?: string;
    nameTh?: string | null;
    displayAlias?: string | null;
    taxId?: string | null;
    branchNumber?: string | null;
    address?: string | null;
    addressTh?: string | null;
    email?: string | null;
    paymentTermsDays?: number | null;
    isVatRegistered?: boolean | null;
    entityType?: "individual" | "company" | "foreign";
    country?: string;
  }
) {
  const [vendor] = await db
    .update(vendors)
    .set(data)
    .where(and(eq(vendors.id, id), eq(vendors.orgId, orgId)))
    .returning();
  return vendor;
}

export async function findVendorByTaxId(
  orgId: string,
  taxId: string,
  branchNumber: string = "00000"
) {
  const results = await db
    .select()
    .from(vendors)
    .where(
      and(
        eq(vendors.orgId, orgId),
        eq(vendors.taxId, taxId),
        eq(vendors.branchNumber, branchNumber),
        isNull(vendors.deletedAt)
      )
    )
    .limit(1);
  return results[0] ?? null;
}

export async function softDeleteVendor(orgId: string, id: string) {
  await db
    .update(vendors)
    .set({ deletedAt: new Date() })
    .where(and(eq(vendors.id, id), eq(vendors.orgId, orgId)));
}
