ALTER TABLE "news_posts" ADD COLUMN "event_date" date;--> statement-breakpoint
CREATE INDEX "news_posts_dated_idx" ON "news_posts" USING btree ("status","event_date","published_at");