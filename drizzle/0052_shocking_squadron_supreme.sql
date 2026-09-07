CREATE TABLE "team_match_suggestions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"new_team_id" uuid NOT NULL,
	"existing_team_id" uuid NOT NULL,
	"confidence" text NOT NULL,
	"why" text NOT NULL,
	"model" text NOT NULL,
	"dismissed_at" timestamp with time zone,
	"accepted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "team_match_suggestions_pair_uq" UNIQUE("new_team_id","existing_team_id")
);
--> statement-breakpoint
ALTER TABLE "team_match_suggestions" ADD CONSTRAINT "team_match_suggestions_new_team_id_teams_id_fk" FOREIGN KEY ("new_team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_match_suggestions" ADD CONSTRAINT "team_match_suggestions_existing_team_id_teams_id_fk" FOREIGN KEY ("existing_team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;