ALTER TABLE "matches" ADD COLUMN "score_set_by" uuid;--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "score_set_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_score_set_by_users_id_fk" FOREIGN KEY ("score_set_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;