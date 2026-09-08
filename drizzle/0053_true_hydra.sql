CREATE TABLE "team_non_duplicates" (
	"a_team_id" uuid NOT NULL,
	"b_team_id" uuid NOT NULL,
	"dismissed_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "team_non_duplicates_a_team_id_b_team_id_pk" PRIMARY KEY("a_team_id","b_team_id")
);
--> statement-breakpoint
ALTER TABLE "team_non_duplicates" ADD CONSTRAINT "team_non_duplicates_a_team_id_teams_id_fk" FOREIGN KEY ("a_team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_non_duplicates" ADD CONSTRAINT "team_non_duplicates_b_team_id_teams_id_fk" FOREIGN KEY ("b_team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_non_duplicates" ADD CONSTRAINT "team_non_duplicates_dismissed_by_users_id_fk" FOREIGN KEY ("dismissed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;