import { neon } from "@neondatabase/serverless";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

async function main() {
  const sql = neon(process.env.DATABASE_URL!);

  const docs = await sql`
    SELECT
      d.id,
      d.document_number,
      d.category,
      d.vendor_id,
      d.status,
      d.created_at,
      v.display_alias,
      v.name as vendor_name
    FROM documents d
    LEFT JOIN vendors v ON v.id = d.vendor_id
    WHERE d.deleted_at IS NULL
      AND (v.name ILIKE '%ksher%' OR v.display_alias ILIKE '%ksher%')
    ORDER BY d.created_at DESC
    LIMIT 10
  `;

  console.log("Ksher docs:");
  for (const d of docs) {
    console.log(
      `  ${d.id.slice(0, 8)} | num=${d.document_number} | cat=${d.category ?? "NULL"} | status=${d.status} | vendor=${d.display_alias ?? d.vendor_name}`
    );
  }

  const vendorTier = await sql`
    SELECT vt.tier, vt.docs_processed, vt.corrections_applied, v.display_alias, v.name
    FROM vendor_tier vt
    JOIN vendors v ON v.id = vt.vendor_id
    WHERE v.name ILIKE '%ksher%' OR v.display_alias ILIKE '%ksher%'
  `;

  console.log("\nKsher vendor_tier:");
  for (const vt of vendorTier) {
    console.log(
      `  ${vt.display_alias ?? vt.name}: tier=${vt.tier} docs=${vt.docs_processed} corrections=${vt.corrections_applied}`
    );
  }

  const exemplars = await sql`
    SELECT ee.field_name, ee.ai_value, ee.user_value, ee.was_corrected, ee.created_at
    FROM extraction_exemplars ee
    JOIN vendors v ON v.id = ee.vendor_id
    WHERE v.name ILIKE '%ksher%' OR v.display_alias ILIKE '%ksher%'
    ORDER BY ee.created_at DESC
    LIMIT 20
  `;

  console.log("\nKsher exemplars:");
  for (const e of exemplars) {
    console.log(
      `  ${e.field_name}: ai="${e.ai_value}" → user="${e.user_value}" corrected=${e.was_corrected}`
    );
  }
}

main().catch(console.error);
