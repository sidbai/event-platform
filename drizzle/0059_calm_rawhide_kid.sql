CREATE TABLE "match_proposals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid NOT NULL,
	"opponent_team_id" uuid NOT NULL,
	"proposed_by" uuid NOT NULL,
	"played_on" timestamp with time zone NOT NULL,
	"our_score" integer NOT NULL,
	"their_score" integer NOT NULL,
	"was_home" boolean DEFAULT false NOT NULL,
	"competition" text,
	"status" "claim_status" DEFAULT 'pending' NOT NULL,
	"decided_by" uuid,
	"decided_at" timestamp with time zone,
	"match_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "match_proposals" ADD CONSTRAINT "match_proposals_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_proposals" ADD CONSTRAINT "match_proposals_opponent_team_id_teams_id_fk" FOREIGN KEY ("opponent_team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_proposals" ADD CONSTRAINT "match_proposals_proposed_by_users_id_fk" FOREIGN KEY ("proposed_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_proposals" ADD CONSTRAINT "match_proposals_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_proposals" ADD CONSTRAINT "match_proposals_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "match_proposals_status_idx" ON "match_proposals" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "match_proposals_team_idx" ON "match_proposals" USING btree ("team_id");