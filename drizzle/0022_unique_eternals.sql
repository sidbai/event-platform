CREATE TYPE "public"."coach_role" AS ENUM('head', 'assistant', 'director');--> statement-breakpoint
CREATE TABLE "coach_edits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"coach_id" uuid NOT NULL,
	"edited_by" uuid,
	"name" text NOT NULL,
	"role" "coach_role" NOT NULL,
	"age_groups" text[],
	"summary" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "coaches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"club_id" uuid NOT NULL,
	"role" "coach_role" DEFAULT 'head' NOT NULL,
	"age_groups" text[],
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "coaches_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "reviews" ADD COLUMN "team_label" text;--> statement-breakpoint
ALTER TABLE "reviews" ADD COLUMN "season" text;--> statement-breakpoint
ALTER TABLE "reviews" ADD COLUMN "years_with" integer;--> statement-breakpoint
ALTER TABLE "reviews" ADD COLUMN "recommends" boolean;--> statement-breakpoint
ALTER TABLE "coach_edits" ADD CONSTRAINT "coach_edits_coach_id_coaches_id_fk" FOREIGN KEY ("coach_id") REFERENCES "public"."coaches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coach_edits" ADD CONSTRAINT "coach_edits_edited_by_users_id_fk" FOREIGN KEY ("edited_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coaches" ADD CONSTRAINT "coaches_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coaches" ADD CONSTRAINT "coaches_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coaches" ADD CONSTRAINT "coaches_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "coach_edits_coach_idx" ON "coach_edits" USING btree ("coach_id","created_at");--> statement-breakpoint
CREATE INDEX "coaches_club_idx" ON "coaches" USING btree ("club_id");