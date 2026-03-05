-- Migration: 0002_living_atlas
-- Adds tables required by the LensForge Living Atlas Telegram Mini App.

-- ─── user_profiles ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "user_profiles" (
  "id"               uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "telegram_id"      varchar(30)  NOT NULL,
  "first_name"       varchar(255) NOT NULL,
  "last_name"        varchar(255),
  "username"         varchar(255),
  "is_premium"       boolean      NOT NULL DEFAULT false,
  "photo_url"        text,
  "games_played"     integer      NOT NULL DEFAULT 0,
  "games_won"        integer      NOT NULL DEFAULT 0,
  "cxp_total"        integer      NOT NULL DEFAULT 0,
  "current_streak"   integer      NOT NULL DEFAULT 0,
  "earned_lenses"    jsonb        NOT NULL DEFAULT '[]',
  "active_lens_id"   varchar(100),
  "created_at"       timestamp    NOT NULL DEFAULT now(),
  "updated_at"       timestamp    NOT NULL DEFAULT now(),
  "last_seen_at"     timestamp    NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "user_profiles_telegram_id_unique"
  ON "user_profiles" USING btree ("telegram_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_profiles_username_idx"
  ON "user_profiles" USING btree ("username");

-- ─── sphere_votes ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "sphere_votes" (
  "id"                uuid        PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "sphere_id"         varchar(100) NOT NULL,
  "title"             varchar(500) NOT NULL,
  "description"       text         NOT NULL,
  "proposed_by"       varchar(30)  NOT NULL,
  "status"            varchar(20)  NOT NULL DEFAULT 'open',
  "advice_given"      boolean      NOT NULL DEFAULT false,
  "advice_notes"      text,
  "ai_review_status"  varchar(20)  DEFAULT 'pending',
  "ai_review_notes"   text,
  "impact_flagged"    boolean      NOT NULL DEFAULT false,
  "impact_notes"      text,
  "opens_at"          timestamp    NOT NULL DEFAULT now(),
  "closes_at"         timestamp,
  "created_at"        timestamp    NOT NULL DEFAULT now(),
  "updated_at"        timestamp    NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sphere_votes_sphere_idx"
  ON "sphere_votes" USING btree ("sphere_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sphere_votes_status_idx"
  ON "sphere_votes" USING btree ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sphere_votes_proposed_by_idx"
  ON "sphere_votes" USING btree ("proposed_by");

-- ─── vote_choices ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "vote_choices" (
  "id"           uuid        PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "vote_id"      uuid        NOT NULL REFERENCES "sphere_votes"("id") ON DELETE CASCADE,
  "telegram_id"  varchar(30) NOT NULL,
  "choice"       varchar(20) NOT NULL,
  "rationale"    text,
  "cast_at"      timestamp   NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "vote_choices_unique_voter"
  ON "vote_choices" USING btree ("vote_id", "telegram_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vote_choices_vote_idx"
  ON "vote_choices" USING btree ("vote_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vote_choices_telegram_idx"
  ON "vote_choices" USING btree ("telegram_id");

-- ─── governance_events ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "governance_events" (
  "id"                  uuid         PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "sphere_id"           varchar(100) NOT NULL,
  "event_type"          varchar(60)  NOT NULL,
  "actor_telegram_id"   varchar(30),
  "payload"             jsonb        NOT NULL DEFAULT '{}',
  "created_at"          timestamp    NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "governance_events_sphere_idx"
  ON "governance_events" USING btree ("sphere_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "governance_events_event_type_idx"
  ON "governance_events" USING btree ("event_type");

-- ─── games table additions ────────────────────────────────────────────────────
ALTER TABLE "games"
  ADD COLUMN IF NOT EXISTS "game_mode"      varchar(20) NOT NULL DEFAULT 'pvn',
  ADD COLUMN IF NOT EXISTS "pvn_difficulty" varchar(20) DEFAULT 'standard';
