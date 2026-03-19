import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { sql } from "drizzle-orm";
import * as schema from "@/lib/db/schema";

/**
 * Creates a test database connection using node-postgres (not Neon serverless).
 * Uses TEST_DATABASE_URL if set, otherwise the Docker Compose postgres at localhost:5433.
 */
export function createTestDb() {
  const url =
    process.env.TEST_DATABASE_URL ??
    "postgres://test:test@localhost:5433/thai_accounting_test";
  const pool = new pg.Pool({ connectionString: url });
  return { db: drizzle({ client: pool, schema }), pool };
}

/**
 * Run all migrations against the test DB by executing the migration SQL files
 * using the raw pg pool (not Drizzle) for reliable multi-statement execution.
 */
export async function migrateTestDb(pool: pg.Pool) {
  const fs = await import("fs");
  const path = await import("path");

  const migrationsDir = path.resolve(process.cwd(), "drizzle");
  const files = fs.readdirSync(migrationsDir)
    .filter((f: string) => f.endsWith(".sql"))
    .sort();

  const client = await pool.connect();
  try {
    for (const file of files) {
      const content = fs.readFileSync(path.join(migrationsDir, file), "utf-8");
      // Replace drizzle breakpoint markers with semicolons and newlines
      const cleaned = content.replace(/--> statement-breakpoint\n?/g, "\n");
      await client.query(cleaned);
    }
  } finally {
    client.release();
  }
}

/**
 * Drop all tables and types — full reset for test isolation.
 */
export async function resetTestDb(pool: pg.Pool) {
  const client = await pool.connect();
  try {
    await client.query("DROP SCHEMA public CASCADE");
    await client.query("CREATE SCHEMA public");
  } finally {
    client.release();
  }
}

/**
 * Create a test org and return it.
 */
export async function createTestOrg(db: ReturnType<typeof createTestDb>["db"]) {
  const [org] = await db
    .insert(schema.organizations)
    .values({
      name: "Test Org",
      taxId: "1234567890123",
    })
    .returning();
  return org;
}

/**
 * Create a test bank account and return it.
 */
export async function createTestBankAccount(
  db: ReturnType<typeof createTestDb>["db"],
  orgId: string
) {
  const [account] = await db
    .insert(schema.bankAccounts)
    .values({
      orgId,
      bankCode: "KBANK",
      accountNumber: "1234567890",
      accountName: "Test Account",
    })
    .returning();
  return account;
}
