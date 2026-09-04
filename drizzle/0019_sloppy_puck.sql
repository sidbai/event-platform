CREATE TYPE "public"."news_category" AS ENUM('news', 'recap', 'guide', 'announcement');--> statement-breakpoint
CREATE TYPE "public"."news_status" AS ENUM('draft', 'published');--> statement-breakpoint
ALTER TYPE "public"."discussion_subject" ADD VALUE 'news_post';--> statement-breakpoint
CREATE TABLE "news_posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"summary" text NOT NULL,
	"body" text NOT NULL,
	"cover_url" text,
	"category" "news_category" DEFAULT 'news' NOT NULL,
	"status" "news_status" DEFAULT 'draft' NOT NULL,
	"author_id" uuid,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "news_posts_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "news_posts" ADD CONSTRAINT "news_posts_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "news_posts_published_idx" ON "news_posts" USING btree ("status","published_at");