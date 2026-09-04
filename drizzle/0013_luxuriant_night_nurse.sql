CREATE TABLE "team_invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid NOT NULL,
	"invited_user_id" uuid,
	"email" text,
	"role" "team_role" DEFAULT 'player' NOT NULL,
	"invited_by" uuid,
	"status" "invite_status" DEFAULT 'pending' NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"responded_at" timestamp with time zone,
	CONSTRAINT "team_invites_token_unique" UNIQUE("token"),
	CONSTRAINT "team_invites_team_user_uq" UNIQUE("team_id","invited_user_id"),
	CONSTRAINT "team_invites_team_email_uq" UNIQUE("team_id","email"),
	CONSTRAINT "team_invites_target_ck" CHECK (("team_invites"."invited_user_id" is null) <> ("team_invites"."email" is null))
);
--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "host_team_id" uuid;--> statement-breakpoint
ALTER TABLE "team_invites" ADD CONSTRAINT "team_invites_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_invites" ADD CONSTRAINT "team_invites_invited_user_id_users_id_fk" FOREIGN KEY ("invited_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_invites" ADD CONSTRAINT "team_invites_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "team_invites_email_idx" ON "team_invites" USING btree ("email");--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_host_team_id_teams_id_fk" FOREIGN KEY ("host_team_id") REFERENCES "public"."teams"("id") ON DELETE set null ON UPDATE no action;