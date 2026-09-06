CREATE TYPE "public"."event_task_status" AS ENUM('todo', 'doing', 'done');--> statement-breakpoint
CREATE TABLE "event_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"title" text NOT NULL,
	"detail" text,
	"category" text DEFAULT 'other' NOT NULL,
	"status" "event_task_status" DEFAULT 'todo' NOT NULL,
	"owner" text,
	"due_at" timestamp with time zone,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "event_tasks" ADD CONSTRAINT "event_tasks_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "event_tasks_event_idx" ON "event_tasks" USING btree ("event_id","position");