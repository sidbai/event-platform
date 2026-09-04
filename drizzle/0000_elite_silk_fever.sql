CREATE TYPE "public"."event_status" AS ENUM('draft', 'pending', 'published', 'cancelled', 'completed');--> statement-breakpoint
CREATE TYPE "public"."event_visibility" AS ENUM('public', 'unlisted', 'private');--> statement-breakpoint
CREATE TYPE "public"."location_type" AS ENUM('in_person', 'online', 'hybrid');--> statement-breakpoint
CREATE TYPE "public"."match_stage" AS ENUM('group', 'ko');--> statement-breakpoint
CREATE TYPE "public"."match_status" AS ENUM('scheduled', 'live', 'final', 'forfeit');--> statement-breakpoint
CREATE TABLE "event_divisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"name" text NOT NULL,
	"label" text,
	"birth_years" integer[] DEFAULT '{}' NOT NULL,
	"format" text,
	"roster_min" integer,
	"roster_max" integer,
	CONSTRAINT "event_divisions_event_name_uq" UNIQUE("event_id","name")
);
--> statement-breakpoint
CREATE TABLE "event_kinds" (
	"slug" text PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"icon" text,
	"default_modules" text[] DEFAULT '{}' NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"description" text
);
--> statement-breakpoint
CREATE TABLE "event_teams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"team_id" uuid NOT NULL,
	"division_id" uuid,
	"seed" integer,
	"group_label" text,
	"played" integer DEFAULT 0 NOT NULL,
	"won" integer DEFAULT 0 NOT NULL,
	"drawn" integer DEFAULT 0 NOT NULL,
	"lost" integer DEFAULT 0 NOT NULL,
	"gf" integer DEFAULT 0 NOT NULL,
	"ga" integer DEFAULT 0 NOT NULL,
	"points" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "event_teams_event_team_uq" UNIQUE("event_id","team_id")
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"kind" text NOT NULL,
	"modules" text[] DEFAULT '{}' NOT NULL,
	"title" text NOT NULL,
	"title_zh" text,
	"summary" text,
	"status" "event_status" DEFAULT 'draft' NOT NULL,
	"visibility" "event_visibility" DEFAULT 'public' NOT NULL,
	"location_type" "location_type" DEFAULT 'in_person' NOT NULL,
	"venue_id" uuid,
	"online_url" text,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"timezone" text,
	"age_group" text,
	"gender" text,
	"format" text,
	"level" text,
	"capacity" integer,
	"needs_opponent" boolean DEFAULT false NOT NULL,
	"home_team_id" uuid,
	"away_team_id" uuid,
	"result" jsonb,
	"host" text,
	"discussion_locked" boolean DEFAULT false NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "events_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "matches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"division_id" uuid,
	"stage" "match_stage" DEFAULT 'group' NOT NULL,
	"round" text,
	"group_label" text,
	"field" text,
	"kickoff_at" timestamp with time zone,
	"home_team_id" uuid,
	"away_team_id" uuid,
	"home_placeholder" text,
	"away_placeholder" text,
	"home_score" integer,
	"away_score" integer,
	"status" "match_status" DEFAULT 'scheduled' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rosters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_team_id" uuid NOT NULL,
	"player_name" text NOT NULL,
	"birth_year" integer,
	"gender" text,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "teams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"club" text,
	"age_group" text,
	"gender" text,
	"city" text,
	"crest_url" text,
	"bio" text,
	"claimed_by" uuid,
	"verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "teams_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "venues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"address" text,
	"city" text,
	"region" text,
	"postal_code" text,
	"lat" double precision,
	"lng" double precision,
	"notes" text,
	"map_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "event_divisions" ADD CONSTRAINT "event_divisions_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_teams" ADD CONSTRAINT "event_teams_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_teams" ADD CONSTRAINT "event_teams_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_teams" ADD CONSTRAINT "event_teams_division_id_event_divisions_id_fk" FOREIGN KEY ("division_id") REFERENCES "public"."event_divisions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_kind_event_kinds_slug_fk" FOREIGN KEY ("kind") REFERENCES "public"."event_kinds"("slug") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_division_id_event_divisions_id_fk" FOREIGN KEY ("division_id") REFERENCES "public"."event_divisions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_home_team_id_teams_id_fk" FOREIGN KEY ("home_team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_away_team_id_teams_id_fk" FOREIGN KEY ("away_team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rosters" ADD CONSTRAINT "rosters_event_team_id_event_teams_id_fk" FOREIGN KEY ("event_team_id") REFERENCES "public"."event_teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "events_status_starts_at_idx" ON "events" USING btree ("status","starts_at");--> statement-breakpoint
CREATE INDEX "events_kind_idx" ON "events" USING btree ("kind");--> statement-breakpoint
CREATE INDEX "matches_event_idx" ON "matches" USING btree ("event_id");