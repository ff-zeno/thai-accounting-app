import { neon } from "@neondatabase/serverless";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

async function main() {
  const sql = neon(process.env.DATABASE_URL!);

  const stmts = await sql`SELECT count(*) as c FROM bank_statements`;
  const txns = await sql`SELECT count(*) as c FROM transactions`;
  const softStmts = await sql`SELECT count(*) as c FROM bank_statements WHERE deleted_at IS NOT NULL`;
  const softTxns = await sql`SELECT count(*) as c FROM transactions WHERE deleted_at IS NOT NULL`;

  console.log("Total statements:", stmts[0].c);
  console.log("Soft-deleted statements:", softStmts[0].c);
  console.log("Total transactions:", txns[0].c);
  console.log("Soft-deleted transactions:", softTxns[0].c);

  const idx = await sql`SELECT indexname, indexdef FROM pg_indexes WHERE indexname = 'txn_dedup'`;
  console.log("txn_dedup index:", idx[0]?.indexdef ?? "NOT FOUND");
}

main().catch(console.error);
