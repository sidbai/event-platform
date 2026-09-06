ALTER TABLE "event_teams" ADD COLUMN "source_team_id" text;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "source_platform" text;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "source_event_id" text;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "last_synced_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "next_sync_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "last_sync_error" text;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "last_content_hash" text;--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "source_match_id" text;