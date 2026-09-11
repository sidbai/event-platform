CREATE TYPE "public"."booking_status" AS ENUM('requested', 'confirmed', 'declined', 'cancelled');--> statement-breakpoint
ALTER TYPE "public"."conversation_subject" ADD VALUE 'session';--> statement-breakpoint
CREATE TABLE "session_bookings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"booked_by" uuid NOT NULL,
	"player_name" text NOT NULL,
	"player_birth_year" integer,
	"note" text,
	"status" "booking_status" DEFAULT 'requested' NOT NULL,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "session_bookings_one_per_player" UNIQUE("session_id","booked_by","player_name")
);
--> statement-breakpoint
CREATE TABLE "training_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"coach_id" uuid NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"location" text NOT NULL,
	"capacity" integer DEFAULT 1 NOT NULL,
	"birth_year_from" integer,
	"birth_year_to" integer,
	"notes" text,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "coach_name" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "coach_blurb" text;--> statement-breakpoint
ALTER TABLE "session_bookings" ADD CONSTRAINT "session_bookings_session_id_training_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."training_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_bookings" ADD CONSTRAINT "session_bookings_booked_by_users_id_fk" FOREIGN KEY ("booked_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_sessions" ADD CONSTRAINT "training_sessions_coach_id_users_id_fk" FOREIGN KEY ("coach_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "session_bookings_booked_by_idx" ON "session_bookings" USING btree ("booked_by");--> statement-breakpoint
CREATE INDEX "training_sessions_coach_starts_idx" ON "training_sessions" USING btree ("coach_id","starts_at");--> statement-breakpoint
CREATE INDEX "training_sessions_starts_idx" ON "training_sessions" USING btree ("starts_at");