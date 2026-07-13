-- Per-user navigation pins (Home dashboard favorites) and org tax-profile
-- flags used to gate which compliance obligations apply (PND1/SSO need
-- employees; PP36 needs imported services).
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "has_employees" boolean NOT NULL DEFAULT false;
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "has_imported_services" boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS "user_nav_pins" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "user_id" text NOT NULL,
  "href" text NOT NULL,
  "position" integer NOT NULL DEFAULT 0,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "user_nav_pins_org_user_href_uniq"
  ON "user_nav_pins" ("org_id", "user_id", "href");
CREATE INDEX IF NOT EXISTS "user_nav_pins_org_user_idx"
  ON "user_nav_pins" ("org_id", "user_id");
