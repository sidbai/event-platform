CREATE TYPE "public"."forum_category" AS ENUM('general', 'looking-for-players', 'looking-for-teams', 'coaching', 'tournaments', 'logistics', 'feedback');--> statement-breakpoint
ALTER TYPE "public"."discussion_subject" ADD VALUE 'forum_post';--> statement-breakpoint
CREATE TABLE "forum_posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"category" "forum_category" DEFAULT 'general' NOT NULL,
	"author_id" uuid,
	"pinned" boolean DEFAULT false NOT NULL,
	"locked" boolean DEFAULT false NOT NULL,
	"last_activity_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "forum_posts_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "forum_posts" ADD CONSTRAINT "forum_posts_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "forum_posts_activity_idx" ON "forum_posts" USING btree ("pinned","last_activity_at");