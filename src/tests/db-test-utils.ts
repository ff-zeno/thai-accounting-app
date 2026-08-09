import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
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

// Schema build state and the reference data the migrations seed both live here,
// out of `public` so a reset can truncate `public` wholesale.
const META_SCHEMA = "_test_meta";
const STATE_TABLE = `${META_SCHEMA}.schema_state`;

/**
 * Top-level tables in `public` — partition children are excluded, since
 * truncating a partitioned parent already cascades to them.
 */
async function publicTables(client: pg.PoolClient): Promise<string[]> {
  const { rows } = await client.query<{ relname: string }>(`
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r', 'p')
      AND NOT EXISTS (SELECT 1 FROM pg_inherits i WHERE i.inhrelid = c.oid)
  `);
  return rows.map((r) => r.relname);
}

/**
 * Copy every table the migrations left rows in (Thai business calendar, CIT
 * brackets, minimum asset lives) so resetTestDb can put them back after a
 * TRUNCATE without replaying the migrations.
 */
async function snapshotSeedData(client: pg.PoolClient) {
  for (const table of await publicTables(client)) {
    const { rows } = await client.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM public."${table}"`
    );
    if (rows[0].n === 0) continue;
    await client.query(
      `CREATE TABLE ${META_SCHEMA}."${table}" AS TABLE public."${table}"`
    );
  }
}

/**
 * Build the schema once per Postgres instance rather than once per test file.
 *
 * All 43 db.test.ts files call this in beforeAll, and vitest runs them
 * sequentially. Replaying every migration each time meant rebuilding the whole
 * database 43 times — a 14-minute CI job. The migration set is fingerprinted,
 * so a schema that is already current is a no-op; editing or adding a migration
 * rebuilds it on the next run.
 */
export async function migrateTestDb(pool: pg.Pool) {
  const fs = await import("fs");
  const path = await import("path");
  const crypto = await import("crypto");

  const migrationsDir = path.resolve(process.cwd(), "drizzle");
  const files = fs.readdirSync(migrationsDir)
    .filter((f: string) => f.endsWith(".sql"))
    .sort();
  const sources = files.map((f: string) =>
    fs.readFileSync(path.join(migrationsDir, f), "utf-8")
  );

  const fingerprint = crypto
    .createHash("sha1")
    .update(files.map((f: string, i: number) => f + sources[i]).join("\0"))
    .digest("hex");

  const client = await pool.connect();
  try {
    const current = await client
      .query<{ fingerprint: string }>(`SELECT fingerprint FROM ${STATE_TABLE}`)
      .catch(() => ({ rows: [] as { fingerprint: string }[] }));
    if (current.rows[0]?.fingerprint === fingerprint) return;

    await client.query("DROP SCHEMA IF EXISTS public CASCADE");
    await client.query("CREATE SCHEMA public");
    await client.query(`DROP SCHEMA IF EXISTS ${META_SCHEMA} CASCADE`);
    await client.query(`CREATE SCHEMA ${META_SCHEMA}`);

    for (const source of sources) {
      // Replace drizzle breakpoint markers with semicolons and newlines
      await client.query(source.replace(/--> statement-breakpoint\n?/g, "\n"));
    }

    await snapshotSeedData(client);
    await client.query(
      `CREATE TABLE ${STATE_TABLE} (fingerprint text NOT NULL)`
    );
    await client.query(`INSERT INTO ${STATE_TABLE} VALUES ($1)`, [fingerprint]);
  } finally {
    client.release();
  }
}

/**
 * Empty every table and put the migration-seeded reference data back — full
 * isolation between test files, without dropping the schema.
 */
export async function resetTestDb(pool: pg.Pool) {
  const client = await pool.connect();
  try {
    const tables = await publicTables(client);
    if (tables.length === 0) return; // schema not built yet — first file in the run

    await client.query(
      `TRUNCATE TABLE ${tables.map((t) => `public."${t}"`).join(", ")} CASCADE`
    );

    const { rows: seeded } = await client.query<{ relname: string }>(
      `SELECT c.relname
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = '${META_SCHEMA}'
         AND c.relkind = 'r'
         AND c.relname <> 'schema_state'`
    );
    for (const { relname } of seeded) {
      await client.query(
        `INSERT INTO public."${relname}" SELECT * FROM ${META_SCHEMA}."${relname}"`
      );
    }
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
 * Create a test vendor and return it.
 */
export async function createTestVendor(
  db: ReturnType<typeof createTestDb>["db"],
  orgId: string,
  overrides: { taxId?: string; name?: string } = {}
) {
  const [vendor] = await db
    .insert(schema.vendors)
    .values({
      orgId,
      name: overrides.name ?? "Test Vendor",
      taxId: overrides.taxId ?? "3333333333333",
      entityType: "company",
    })
    .returning();
  return vendor;
}

/**
 * Create a minimal test document and return it.
 */
export async function createTestDocument(
  db: ReturnType<typeof createTestDb>["db"],
  orgId: string,
  vendorId?: string
) {
  const [doc] = await db
    .insert(schema.documents)
    .values({
      orgId,
      direction: "expense",
      type: "invoice",
      status: "draft",
      ...(vendorId ? { vendorId } : {}),
    })
    .returning();
  return doc;
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

/**
 * Create a test bank transaction and return it.
 *
 * Defaults to a credit, since the tests that need transactions directly are
 * mostly about deposits being explained.
 */
export async function createTestTransaction(
  db: ReturnType<typeof createTestDb>["db"],
  orgId: string,
  bankAccountId: string,
  overrides: {
    amount?: string;
    date?: string;
    type?: "debit" | "credit";
    description?: string;
    counterparty?: string;
    referenceNo?: string;
  } = {}
) {
  const [transaction] = await db
    .insert(schema.transactions)
    .values({
      orgId,
      bankAccountId,
      date: overrides.date ?? "2026-04-01",
      amount: overrides.amount ?? "1000.00",
      type: overrides.type ?? "credit",
      description: overrides.description ?? null,
      counterparty: overrides.counterparty ?? null,
      referenceNo: overrides.referenceNo ?? null,
    })
    .returning();
  return transaction;
}
