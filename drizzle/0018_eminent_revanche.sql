CREATE TABLE "club_edits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"club_id" uuid NOT NULL,
	"edited_by" uuid,
	"name" text NOT NULL,
	"city" text,
	"website" text,
	"crest_url" text,
	"summary" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "club_edits" ADD CONSTRAINT "club_edits_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club_edits" ADD CONSTRAINT "club_edits_edited_by_users_id_fk" FOREIGN KEY ("edited_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "club_edits_club_idx" ON "club_edits" USING btree ("club_id","created_at");--> statement-breakpoint
-- Baseline snapshot per existing club, so history has a floor to revert to.
-- edited_by stays null: nobody made this "edit", it is where the club started.
INSERT INTO "club_edits" ("club_id", "edited_by", "name", "city", "website", "crest_url", "summary", "created_at")
SELECT "id", NULL, "name", "city", "website", "crest_url", 'Original entry', "created_at" FROM "clubs";
