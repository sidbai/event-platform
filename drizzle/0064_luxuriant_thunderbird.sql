ALTER TABLE "users" ADD COLUMN "feed_token" text;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_feed_token_unique" UNIQUE("feed_token");