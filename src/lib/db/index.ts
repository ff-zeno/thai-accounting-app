import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import * as schema from "./schema";

// Send one-shot queries (anything outside .transaction()) over HTTP fetch
// rather than a WebSocket, so an idled-out socket can't take a plain SELECT
// down with it. Transactions still use WebSockets via pool.connect().
// Neon disables this if connect/acquire/release/remove listeners are attached
// to the Pool — "error" is not one of them, so the handler below is safe.
neonConfig.poolQueryViaFetch = true;

function createDb() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL environment variable is not set");
  }

  const pool = new Pool({
    connectionString: databaseUrl,
    // Neon autosuspends idle computes. Retire sockets before they're reaped so
    // the pool never hands out a dead one.
    idleTimeoutMillis: 10_000,
  });
  // Without this, a dropped socket surfaces as an unhandled error event.
  pool.on("error", (err: Error) => console.error("[db] pool error:", err));
  return drizzle({ client: pool, schema });
}

export const db = createDb();
export type Database = ReturnType<typeof createDb>;

/** Type that works for both the main db instance and a transaction handle */
export type DbConnection = Pick<Database, "select" | "insert" | "update" | "delete" | "execute">;
