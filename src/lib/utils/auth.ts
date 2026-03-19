import { currentUser } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq, isNull, and } from "drizzle-orm";

/**
 * Get the current Clerk user's corresponding `users` table row.
 * Returns null if no Clerk session or no matching DB user.
 */
export async function getCurrentUser() {
  const clerkUser = await currentUser();
  if (!clerkUser) return null;

  const [dbUser] = await db
    .select()
    .from(users)
    .where(and(eq(users.clerkId, clerkUser.id), isNull(users.deletedAt)))
    .limit(1);

  return dbUser ?? null;
}

/**
 * Get the current Clerk user's `users` table ID.
 * Convenience wrapper for audit log actorId.
 */
export async function getCurrentUserId(): Promise<string | null> {
  const user = await getCurrentUser();
  return user?.id ?? null;
}
