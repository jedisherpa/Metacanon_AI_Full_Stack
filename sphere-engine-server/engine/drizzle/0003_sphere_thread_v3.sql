-- Migration: 0003_sphere_thread_v3
-- Adds the Sphere Thread v3 transactional event spine and counselor registry.

CREATE TABLE IF NOT EXISTS "sphere_threads" (
  "thread_id" uuid PRIMARY KEY,
  "mission_id" uuid NOT NULL,
  "created_by" text NOT NULL,
  "state" text NOT NULL DEFAULT 'ACTIVE',
  "next_sequence" bigint NOT NULL DEFAULT 1,
  "last_entry_hash" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_sphere_threads_created_at"
  ON "sphere_threads" USING btree ("created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_sphere_threads_state"
  ON "sphere_threads" USING btree ("state");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "sphere_events" (
  "event_id" bigserial PRIMARY KEY,
  "thread_id" uuid NOT NULL REFERENCES "sphere_threads"("thread_id") ON DELETE CASCADE,
  "sequence" bigint NOT NULL,
  "message_id" uuid NOT NULL,
  "author_did" text NOT NULL,
  "intent" text NOT NULL,
  "timestamp" timestamptz NOT NULL,
  "client_envelope" jsonb NOT NULL,
  "ledger_envelope" jsonb NOT NULL,
  "payload" jsonb NOT NULL,
  "entry_hash" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "sphere_events_thread_sequence_unique" UNIQUE ("thread_id", "sequence"),
  CONSTRAINT "sphere_events_thread_message_unique" UNIQUE ("thread_id", "message_id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_sphere_events_thread_sequence"
  ON "sphere_events" USING btree ("thread_id", "sequence" DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_sphere_events_author"
  ON "sphere_events" USING btree ("author_did");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_sphere_events_intent"
  ON "sphere_events" USING btree ("intent");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "counselors" (
  "id" bigserial PRIMARY KEY,
  "counselor_did" text NOT NULL,
  "counselor_set" text NOT NULL DEFAULT 'security_council',
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "revoked_at" timestamptz,
  CONSTRAINT "counselors_did_unique" UNIQUE ("counselor_did")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_counselors_active"
  ON "counselors" USING btree ("is_active");
