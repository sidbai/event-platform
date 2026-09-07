-- team_slugs is created by 0040, which was hand-written and left no
-- snapshot behind — so drizzle diffed from 0039 and proposed it again.
-- Removed here: the table exists in every database that has run 0040.
CREATE TYPE "public"."team_affiliation" AS ENUM('unknown', 'club', 'independent');--> statement-breakpoint
CREATE TABLE "club_aliases" (
	"alias" text PRIMARY KEY NOT NULL,
	"club_id" uuid NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "teams" ADD COLUMN "club_id" uuid;--> statement-breakpoint
ALTER TABLE "teams" ADD COLUMN "affiliation" "team_affiliation" DEFAULT 'unknown' NOT NULL;--> statement-breakpoint
ALTER TABLE "club_aliases" ADD CONSTRAINT "club_aliases_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club_aliases" ADD CONSTRAINT "club_aliases_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "club_aliases_club_idx" ON "club_aliases" USING btree ("club_id");--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "teams_club_idx" ON "teams" USING btree ("club_id");--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_affiliation_club_ck" CHECK (("teams"."affiliation" = 'club') = ("teams"."club_id" IS NOT NULL));