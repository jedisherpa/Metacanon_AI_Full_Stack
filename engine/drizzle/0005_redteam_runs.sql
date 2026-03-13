-- Migration: 0005_redteam_runs
-- Persists governance red-team harness runs into Postgres for durable operator history.

CREATE TABLE IF NOT EXISTS "redteam_runs" (
  "run_id" varchar(96) PRIMARY KEY NOT NULL,
  "suite" varchar(80) NOT NULL,
  "status" varchar(20) NOT NULL,
  "generated_at" timestamp with time zone NOT NULL,
  "started_at" timestamp with time zone,
  "completed_at" timestamp with time zone,
  "duration_ms" integer,
  "total_scenarios" integer NOT NULL DEFAULT 0,
  "passed_scenarios" integer NOT NULL DEFAULT 0,
  "failed_scenarios" integer NOT NULL DEFAULT 0,
  "blocked_probe_scenarios" integer NOT NULL DEFAULT 0,
  "attack_class_counts" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "report" jsonb NOT NULL,
  "report_path" text,
  "snapshot_path" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "redteam_runs_suite_generated_at_idx"
  ON "redteam_runs" ("suite", "generated_at" DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "redteam_runs_status_idx"
  ON "redteam_runs" ("status");
