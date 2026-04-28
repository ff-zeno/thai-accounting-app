ALTER TABLE "audit_log" RENAME TO "audit_log_old";
--> statement-breakpoint
ALTER INDEX IF EXISTS "audit_log_pkey" RENAME TO "audit_log_old_pkey";
--> statement-breakpoint
CREATE TABLE "audit_log" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL,
  "entity_type" text NOT NULL,
  "entity_id" uuid NOT NULL,
  "action" "audit_action" NOT NULL,
  "old_value" jsonb,
  "new_value" jsonb,
  "actor_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id", "created_at"),
  CONSTRAINT "audit_log_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action,
  CONSTRAINT "audit_log_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action
) PARTITION BY RANGE ("created_at");
--> statement-breakpoint
DO $$
DECLARE
  min_month date;
  max_month date;
  start_month date;
  end_month date;
  cursor_month date;
  partition_name text;
BEGIN
  SELECT
    date_trunc('month', MIN(created_at))::date,
    date_trunc('month', MAX(created_at))::date
  INTO min_month, max_month
  FROM audit_log_old;

  start_month := LEAST(
    COALESCE(min_month, date_trunc('month', CURRENT_DATE)::date),
    date_trunc('month', CURRENT_DATE - INTERVAL '1 month')::date
  );
  end_month := GREATEST(
    COALESCE(max_month, date_trunc('month', CURRENT_DATE)::date),
    date_trunc('month', CURRENT_DATE + INTERVAL '12 months')::date
  );

  cursor_month := start_month;
  WHILE cursor_month <= end_month LOOP
    partition_name := 'audit_log_' || to_char(cursor_month, 'YYYY_MM');
    EXECUTE format(
      'CREATE TABLE IF NOT EXISTS %I PARTITION OF audit_log FOR VALUES FROM (%L) TO (%L)',
      partition_name,
      cursor_month::timestamp with time zone,
      (cursor_month + INTERVAL '1 month')::timestamp with time zone
    );
    cursor_month := (cursor_month + INTERVAL '1 month')::date;
  END LOOP;
END;
$$;
--> statement-breakpoint
CREATE TABLE "audit_log_default" PARTITION OF "audit_log" DEFAULT;
--> statement-breakpoint
CREATE INDEX "audit_log_org_created" ON "audit_log" USING btree ("org_id", "created_at" DESC);
--> statement-breakpoint
CREATE INDEX "audit_log_entity_history" ON "audit_log" USING btree ("org_id", "entity_type", "entity_id", "created_at" DESC);
--> statement-breakpoint
INSERT INTO "audit_log" (
  "id",
  "org_id",
  "entity_type",
  "entity_id",
  "action",
  "old_value",
  "new_value",
  "actor_id",
  "created_at"
)
SELECT
  "id",
  "org_id",
  "entity_type",
  "entity_id",
  "action",
  "old_value",
  "new_value",
  "actor_id",
  "created_at"
FROM "audit_log_old";
--> statement-breakpoint
DO $$
DECLARE
  old_count bigint;
  new_count bigint;
BEGIN
  SELECT COUNT(*) INTO old_count FROM audit_log_old;
  SELECT COUNT(*) INTO new_count FROM audit_log;

  IF old_count <> new_count THEN
    RAISE EXCEPTION 'audit_log partition migration row-count mismatch: old %, new %', old_count, new_count;
  END IF;
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION ensure_audit_log_partition_for_month(target_month date)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  month_start date;
  month_end date;
  partition_name text;
  default_rows bigint;
BEGIN
  month_start := date_trunc('month', target_month)::date;
  month_end := (month_start + INTERVAL '1 month')::date;
  partition_name := 'audit_log_' || to_char(month_start, 'YYYY_MM');

  IF to_regclass(partition_name) IS NOT NULL THEN
    RETURN;
  END IF;

  SELECT COUNT(*) INTO default_rows
  FROM audit_log_default
  WHERE created_at >= month_start::timestamp with time zone
    AND created_at < month_end::timestamp with time zone;

  IF default_rows = 0 THEN
    EXECUTE format(
      'CREATE TABLE IF NOT EXISTS %I PARTITION OF audit_log FOR VALUES FROM (%L) TO (%L)',
      partition_name,
      month_start::timestamp with time zone,
      month_end::timestamp with time zone
    );
    RETURN;
  END IF;

  EXECUTE format('CREATE TABLE %I (LIKE audit_log INCLUDING DEFAULTS INCLUDING CONSTRAINTS)', partition_name);
  EXECUTE format(
    'INSERT INTO %I (id, org_id, entity_type, entity_id, action, old_value, new_value, actor_id, created_at)
     SELECT id, org_id, entity_type, entity_id, action, old_value, new_value, actor_id, created_at
     FROM audit_log_default
     WHERE created_at >= $1 AND created_at < $2',
    partition_name
  )
  USING month_start::timestamp with time zone, month_end::timestamp with time zone;

  DELETE FROM audit_log_default
  WHERE created_at >= month_start::timestamp with time zone
    AND created_at < month_end::timestamp with time zone;

  EXECUTE format(
    'ALTER TABLE audit_log ATTACH PARTITION %I FOR VALUES FROM (%L) TO (%L)',
    partition_name,
    month_start::timestamp with time zone,
    month_end::timestamp with time zone
  );
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION ensure_audit_log_monthly_partitions(months_ahead integer DEFAULT 12)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  cursor_month date;
  end_month date;
BEGIN
  cursor_month := date_trunc('month', CURRENT_DATE - INTERVAL '1 month')::date;
  end_month := date_trunc('month', CURRENT_DATE + make_interval(months => months_ahead))::date;

  WHILE cursor_month <= end_month LOOP
    PERFORM ensure_audit_log_partition_for_month(cursor_month);
    cursor_month := (cursor_month + INTERVAL '1 month')::date;
  END LOOP;
END;
$$;
