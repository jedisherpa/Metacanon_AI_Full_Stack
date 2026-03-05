CREATE TABLE IF NOT EXISTS "games" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "question" text NOT NULL,
  "group_size" integer NOT NULL,
  "provider" varchar(10) DEFAULT 'morpheus' NOT NULL,
  "entry_mode" varchar(20) DEFAULT 'self_join' NOT NULL,
  "status" varchar(30) DEFAULT 'draft' NOT NULL,
  "invite_code" varchar(20) NOT NULL,
  "position_reveal_seconds" integer DEFAULT 15 NOT NULL,
  "state_version" integer DEFAULT 0 NOT NULL,
  "deliberation_phase" varchar(30),
  "archived_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "games_invite_code_unique" UNIQUE("invite_code")
);

CREATE TABLE IF NOT EXISTS "game_players" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "game_id" uuid NOT NULL,
  "seat_number" integer NOT NULL,
  "name" varchar(255) NOT NULL,
  "email" varchar(255),
  "access_token" varchar(255) NOT NULL,
  "avatar_id" varchar(100) NOT NULL,
  "avatar_name" varchar(120) NOT NULL,
  "epistemology" varchar(160) NOT NULL,
  "hint_text" text,
  "pre_registered" boolean DEFAULT false NOT NULL,
  "round1_complete" boolean DEFAULT false NOT NULL,
  "round2_complete" boolean DEFAULT false NOT NULL,
  "deliberation_eligible" boolean DEFAULT false NOT NULL,
  "joined_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "game_players_game_seat_unique" ON "game_players" USING btree ("game_id","seat_number");
CREATE UNIQUE INDEX IF NOT EXISTS "game_players_access_token_unique" ON "game_players" USING btree ("access_token");
CREATE INDEX IF NOT EXISTS "game_players_game_id_idx" ON "game_players" USING btree ("game_id");

CREATE TABLE IF NOT EXISTS "round1_responses" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "game_id" uuid NOT NULL,
  "player_id" uuid NOT NULL,
  "content" text NOT NULL,
  "word_count" integer NOT NULL,
  "submitted_at" timestamp DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "round1_responses_game_player_unique" ON "round1_responses" USING btree ("game_id","player_id");
CREATE INDEX IF NOT EXISTS "round1_responses_game_idx" ON "round1_responses" USING btree ("game_id");

CREATE TABLE IF NOT EXISTS "round2_assignments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "game_id" uuid NOT NULL,
  "assignee_player_id" uuid NOT NULL,
  "target_player_id" uuid NOT NULL,
  "prompt_text" text NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "round2_assignments_unique" ON "round2_assignments" USING btree ("game_id","assignee_player_id","target_player_id");
CREATE INDEX IF NOT EXISTS "round2_assignments_assignee_idx" ON "round2_assignments" USING btree ("game_id","assignee_player_id");

CREATE TABLE IF NOT EXISTS "round2_responses" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "game_id" uuid NOT NULL,
  "assignment_id" uuid NOT NULL,
  "assignee_player_id" uuid NOT NULL,
  "target_player_id" uuid NOT NULL,
  "content" text NOT NULL,
  "word_count" integer NOT NULL,
  "submitted_at" timestamp DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "round2_responses_assignment_unique" ON "round2_responses" USING btree ("assignment_id");
CREATE INDEX IF NOT EXISTS "round2_responses_game_idx" ON "round2_responses" USING btree ("game_id");

CREATE TABLE IF NOT EXISTS "synthesis_artifacts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "game_id" uuid NOT NULL,
  "artifact_type" varchar(30) NOT NULL,
  "content" text NOT NULL,
  "generated_at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "synthesis_artifacts_game_idx" ON "synthesis_artifacts" USING btree ("game_id");

CREATE TABLE IF NOT EXISTS "commands" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "game_id" uuid,
  "command_type" varchar(60) NOT NULL,
  "payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" varchar(20) DEFAULT 'queued' NOT NULL,
  "dedupe_key" varchar(120),
  "error" text,
  "attempts" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "started_at" timestamp,
  "finished_at" timestamp
);
CREATE UNIQUE INDEX IF NOT EXISTS "commands_dedupe_key_unique" ON "commands" USING btree ("dedupe_key");
CREATE INDEX IF NOT EXISTS "commands_game_idx" ON "commands" USING btree ("game_id");
CREATE INDEX IF NOT EXISTS "commands_status_idx" ON "commands" USING btree ("status");

CREATE TABLE IF NOT EXISTS "audit_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "game_id" uuid,
  "actor_type" varchar(20) NOT NULL,
  "actor_id" varchar(255),
  "event_type" varchar(100) NOT NULL,
  "payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "audit_events_game_idx" ON "audit_events" USING btree ("game_id");
CREATE INDEX IF NOT EXISTS "audit_events_event_idx" ON "audit_events" USING btree ("event_type");

CREATE TABLE IF NOT EXISTS "admin_sessions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "token_hash" varchar(128) NOT NULL,
  "expires_at" timestamp NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "admin_sessions_token_hash_unique" ON "admin_sessions" USING btree ("token_hash");
CREATE INDEX IF NOT EXISTS "admin_sessions_expires_idx" ON "admin_sessions" USING btree ("expires_at");
