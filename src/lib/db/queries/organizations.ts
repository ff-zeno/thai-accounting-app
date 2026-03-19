import { and, eq, isNull } from "drizzle-orm";
import { db } from "../index";
import { organizations, users } from "../schema";

export async function getAllOrganizations() {
  return db
    .select()
    .from(organizations)
    .where(isNull(organizations.deletedAt));
}

export async function getOrganizationById(id: string) {
  const results = await db
    .select()
    .from(organizations)
    .where(and(eq(organizations.id, id), isNull(organizations.deletedAt)))
    .limit(1);
  return results[0] ?? null;
}

export async function createOrganization(data: {
  name: string;
  nameTh?: string | null;
  taxId: string;
  branchNumber?: string;
  registrationNo?: string | null;
  address?: string | null;
  addressTh?: string | null;
  isVatRegistered?: boolean;
  fiscalYearEndMonth?: number;
  fiscalYearEndDay?: number;
}) {
  const [org] = await db
    .insert(organizations)
    .values({
      name: data.name,
      nameTh: data.nameTh,
      taxId: data.taxId,
      branchNumber: data.branchNumber ?? "00000",
      registrationNo: data.registrationNo,
      address: data.address,
      addressTh: data.addressTh,
      isVatRegistered: data.isVatRegistered ?? false,
      fiscalYearEndMonth: data.fiscalYearEndMonth ?? 12,
      fiscalYearEndDay: data.fiscalYearEndDay ?? 31,
    })
    .returning();

  // Create a stub "System" user for audit trail
  await db.insert(users).values({
    orgId: org.id,
    name: "System",
    email: "system@local",
    role: "system",
  });

  return org;
}

export async function updateOrganization(
  id: string,
  data: {
    name?: string;
    nameTh?: string | null;
    taxId?: string;
    branchNumber?: string;
    registrationNo?: string | null;
    address?: string | null;
    addressTh?: string | null;
    isVatRegistered?: boolean;
    fiscalYearEndMonth?: number;
    fiscalYearEndDay?: number;
  }
) {
  const [org] = await db
    .update(organizations)
    .set(data)
    .where(eq(organizations.id, id))
    .returning();
  return org;
}
