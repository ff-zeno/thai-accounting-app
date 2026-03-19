import { and, eq, isNull, count } from "drizzle-orm";
import { db } from "../index";
import { bankAccounts, bankStatements } from "../schema";

export async function getBankAccountsByOrg(orgId: string) {
  return db
    .select()
    .from(bankAccounts)
    .where(and(eq(bankAccounts.orgId, orgId), isNull(bankAccounts.deletedAt)));
}

export async function getBankAccountById(orgId: string, id: string) {
  const results = await db
    .select()
    .from(bankAccounts)
    .where(
      and(
        eq(bankAccounts.id, id),
        eq(bankAccounts.orgId, orgId),
        isNull(bankAccounts.deletedAt)
      )
    )
    .limit(1);
  return results[0] ?? null;
}

export async function createBankAccount(data: {
  orgId: string;
  bankCode: string;
  accountNumber: string;
  accountName?: string | null;
  currency?: string;
}) {
  const [account] = await db
    .insert(bankAccounts)
    .values({
      orgId: data.orgId,
      bankCode: data.bankCode,
      accountNumber: data.accountNumber,
      accountName: data.accountName,
      currency: data.currency ?? "THB",
    })
    .returning();
  return account;
}

export async function findBankAccountByNumber(
  orgId: string,
  bankCode: string,
  accountNumber: string
) {
  const results = await db
    .select()
    .from(bankAccounts)
    .where(
      and(
        eq(bankAccounts.orgId, orgId),
        eq(bankAccounts.bankCode, bankCode),
        eq(bankAccounts.accountNumber, accountNumber),
        isNull(bankAccounts.deletedAt)
      )
    )
    .limit(1);
  return results[0] ?? null;
}

export async function updateBankAccount(
  orgId: string,
  id: string,
  data: {
    bankCode?: string;
    accountNumber?: string;
    accountName?: string | null;
    currency?: string;
  }
) {
  const [account] = await db
    .update(bankAccounts)
    .set(data)
    .where(and(eq(bankAccounts.id, id), eq(bankAccounts.orgId, orgId)))
    .returning();
  return account;
}

export async function softDeleteBankAccount(
  orgId: string,
  accountId: string
): Promise<{ success: true } | { error: string }> {
  // Check for non-deleted statements
  const [result] = await db
    .select({ stmtCount: count(bankStatements.id) })
    .from(bankStatements)
    .where(
      and(
        eq(bankStatements.orgId, orgId),
        eq(bankStatements.bankAccountId, accountId),
        isNull(bankStatements.deletedAt)
      )
    );

  if (result && result.stmtCount > 0) {
    return {
      error: `Cannot delete account: ${result.stmtCount} statement(s) still exist. Delete all statements first.`,
    };
  }

  await db
    .update(bankAccounts)
    .set({ deletedAt: new Date() })
    .where(
      and(
        eq(bankAccounts.id, accountId),
        eq(bankAccounts.orgId, orgId),
        isNull(bankAccounts.deletedAt)
      )
    );

  return { success: true };
}
