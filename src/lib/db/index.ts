import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

function createDb() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL environment variable is not set");
  }

  const sql = neon(databaseUrl);
  return drizzle({ client: sql, schema });
}

export const db = createDb();
export type Database = ReturnType<typeof createDb>;

/** Type that works for both the main db instance and a transaction handle */
export type DbConnection = Pick<Database, "select" | "insert" | "update" | "delete">;
