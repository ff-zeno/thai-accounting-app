CREATE TABLE "copilot_sessions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "user_id" text NOT NULL,
  "title" text DEFAULT 'Copilot session' NOT NULL,
  "status" text DEFAULT 'open' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone,
  "deleted_at" timestamp with time zone,
  CONSTRAINT "copilot_sessions_status_check" CHECK ("status" IN ('open', 'archived'))
);

CREATE TABLE "copilot_messages" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "session_id" uuid NOT NULL REFERENCES "copilot_sessions"("id"),
  "role" text NOT NULL,
  "content" text NOT NULL,
  "tool_name" text,
  "payload" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "copilot_messages_role_check" CHECK ("role" IN ('user', 'assistant', 'tool'))
);

CREATE TABLE "copilot_tool_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "session_id" uuid REFERENCES "copilot_sessions"("id"),
  "tool_name" text NOT NULL,
  "risk" text NOT NULL,
  "preview_required" boolean NOT NULL,
  "status" text DEFAULT 'succeeded' NOT NULL,
  "input" jsonb NOT NULL,
  "output" jsonb,
  "error" text,
  "created_by_user_id" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "copilot_tool_events_risk_check" CHECK ("risk" IN ('read', 'draft', 'write', 'bulk_write', 'filing_impact')),
  CONSTRAINT "copilot_tool_events_status_check" CHECK ("status" IN ('succeeded', 'failed', 'blocked'))
);

CREATE INDEX "copilot_sessions_org_user_idx" ON "copilot_sessions" ("org_id", "user_id");
CREATE INDEX "copilot_messages_org_session_idx" ON "copilot_messages" ("org_id", "session_id");
CREATE INDEX "copilot_tool_events_org_created_idx" ON "copilot_tool_events" ("org_id", "created_at");
CREATE INDEX "copilot_tool_events_org_tool_idx" ON "copilot_tool_events" ("org_id", "tool_name");

CREATE OR REPLACE FUNCTION guard_copilot_session_same_org()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  session_org_id uuid;
BEGIN
  IF NEW.session_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT org_id INTO session_org_id FROM copilot_sessions WHERE id = NEW.session_id;
  IF session_org_id IS NULL OR session_org_id <> NEW.org_id THEN
    RAISE EXCEPTION 'Copilot session must belong to the same organization';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER guard_copilot_messages_session_org_trigger
BEFORE INSERT OR UPDATE OF org_id, session_id ON copilot_messages
FOR EACH ROW EXECUTE FUNCTION guard_copilot_session_same_org();

CREATE TRIGGER guard_copilot_tool_events_session_org_trigger
BEFORE INSERT OR UPDATE OF org_id, session_id ON copilot_tool_events
FOR EACH ROW EXECUTE FUNCTION guard_copilot_session_same_org();
