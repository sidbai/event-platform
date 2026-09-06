ALTER TABLE "events" ADD COLUMN "source_name" text;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "source_url" text;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "listed_by" uuid;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_listed_by_users_id_fk" FOREIGN KEY ("listed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;