CREATE TABLE IF NOT EXISTS "councils" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mode" varchar(10) NOT NULL,
	"question" text NOT NULL,
	"host_id" varchar(255) NOT NULL,
	"host_token" varchar(255) NOT NULL,
	"status" varchar(20) DEFAULT 'setup' NOT NULL,
	"group_size" integer NOT NULL,
	"llm_provider" varchar(10) DEFAULT 'morpheus' NOT NULL,
	"lens_pack_id" varchar(50) NOT NULL,
	"position_reveal_seconds" integer DEFAULT 15 NOT NULL,
	"invite_code" varchar(20) NOT NULL,
	"season_id" uuid,
	"week_number" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"started_at" timestamp,
	"deliberation_started_at" timestamp,
	"archived_at" timestamp,
	CONSTRAINT "councils_invite_code_unique" UNIQUE("invite_code")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "players" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"email" varchar(255),
	"player_token" varchar(255) NOT NULL,
	"ghl_contact_id" varchar(255),
	"council_id" uuid,
	"season_id" uuid,
	"seat_number" integer NOT NULL,
	"avatar_id" varchar(50) NOT NULL,
	"avatar_name" varchar(100) NOT NULL,
	"epistemology" varchar(100) NOT NULL,
	"original_avatar_id" varchar(50),
	"swapped" boolean DEFAULT false NOT NULL,
	"hint_text" text,
	"joined_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "responses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_id" uuid NOT NULL,
	"council_id" uuid NOT NULL,
	"content" text NOT NULL,
	"word_count" integer NOT NULL,
	"submitted_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "season_players" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"season_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"email" varchar(255) NOT NULL,
	"ghl_contact_id" varchar(255),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "season_questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"season_id" uuid NOT NULL,
	"week_number" integer NOT NULL,
	"question" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "seasons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"host_id" varchar(255) NOT NULL,
	"host_token" varchar(255) NOT NULL,
	"llm_provider" varchar(10) DEFAULT 'morpheus' NOT NULL,
	"duration_weeks" integer NOT NULL,
	"current_week" integer DEFAULT 0 NOT NULL,
	"lens_rotation" varchar(10) DEFAULT 'fixed' NOT NULL,
	"season_memory" boolean DEFAULT true NOT NULL,
	"memory_summary" text DEFAULT '' NOT NULL,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"cron_time_monday" varchar(10) DEFAULT '08:00' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "synthesis" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"council_id" uuid NOT NULL,
	"artifact_type" varchar(20) NOT NULL,
	"content" text NOT NULL,
	"token_count" integer,
	"generated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "season_questions_unique" ON "season_questions" USING btree ("season_id","week_number");