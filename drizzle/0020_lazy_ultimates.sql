ALTER TYPE "public"."news_status" ADD VALUE 'pending' BEFORE 'published';--> statement-breakpoint
ALTER TABLE "news_posts" ADD COLUMN "review_note" text;