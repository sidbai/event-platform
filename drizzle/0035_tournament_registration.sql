CREATE TYPE "public"."registration_status" AS ENUM('requested', 'accepted', 'waitlisted', 'declined', 'withdrawn');--> statement-breakpoint
CREATE TABLE "event_registrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"division_id" uuid NOT NULL,
	"team_id" uuid NOT NULL,
	"status" "registration_status" DEFAULT 'requested' NOT NULL,
	"requested_by" uuid,
	"note" text,
	"fee_cents_at_request" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_registrations_division_team_uq" UNIQUE("division_id","team_id")
);
--> statement-breakpoint
ALTER TABLE "event_divisions" ADD COLUMN "fee_cents" integer;--> statement-breakpoint
ALTER TABLE "event_divisions" ADD COLUMN "capacity" integer;--> statement-breakpoint
ALTER TABLE "event_divisions" ADD COLUMN "registration_opens_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "event_divisions" ADD COLUMN "registration_closes_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "event_registrations" ADD CONSTRAINT "event_registrations_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_registrations" ADD CONSTRAINT "event_registrations_division_id_event_divisions_id_fk" FOREIGN KEY ("division_id") REFERENCES "public"."event_divisions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_registrations" ADD CONSTRAINT "event_registrations_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_registrations" ADD CONSTRAINT "event_registrations_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "event_registrations_event_idx" ON "event_registrations" USING btree ("event_id","status");