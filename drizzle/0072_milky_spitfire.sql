CREATE TYPE "public"."sync_job_status" AS ENUM('queued', 'running', 'done', 'failed');--> statement-breakpoint
CREATE TABLE "sync_job_parts" (
	"job_id" uuid NOT NULL,
	"step" integer NOT NULL,
	"payload" jsonb NOT NULL,
	CONSTRAINT "sync_job_parts_job_id_step_pk" PRIMARY KEY("job_id","step")
);
--> statement-breakpoint
CREATE TABLE "sync_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"status" "sync_job_status" DEFAULT 'queued' NOT NULL,
	"requested_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"leased_until" timestamp with time zone,
	"cursor" jsonb,
	"steps_done" integer DEFAULT 0 NOT NULL,
	"steps_total" integer,
	"step_label" text,
	"detail" text
);
--> statement-breakpoint
ALTER TABLE "sync_job_parts" ADD CONSTRAINT "sync_job_parts_job_id_sync_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."sync_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_jobs" ADD CONSTRAINT "sync_jobs_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_jobs" ADD CONSTRAINT "sync_jobs_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sync_jobs_event_idx" ON "sync_jobs" USING btree ("event_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "sync_jobs_one_live_per_event_uq" ON "sync_jobs" USING btree ("event_id") WHERE "sync_jobs"."status" in ('queued', 'running');