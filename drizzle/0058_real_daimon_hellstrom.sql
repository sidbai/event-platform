CREATE TABLE "team_merges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"survivor_id" uuid,
	"merged_at" timestamp with time zone DEFAULT now() NOT NULL,
	"merged_by" uuid,
	"team" jsonb NOT NULL,
	"moved" jsonb NOT NULL,
	"dropped" jsonb NOT NULL,
	"undone_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "team_merges" ADD CONSTRAINT "team_merges_survivor_id_teams_id_fk" FOREIGN KEY ("survivor_id") REFERENCES "public"."teams"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_merges" ADD CONSTRAINT "team_merges_merged_by_users_id_fk" FOREIGN KEY ("merged_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "team_merges_survivor_idx" ON "team_merges" USING btree ("survivor_id");