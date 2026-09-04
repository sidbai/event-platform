CREATE TYPE "public"."invite_status" AS ENUM('pending', 'accepted', 'declined');--> statement-breakpoint
CREATE TABLE "event_invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"invited_user_id" uuid,
	"email" text,
	"invited_by" uuid,
	"status" "invite_status" DEFAULT 'pending' NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"responded_at" timestamp with time zone,
	CONSTRAINT "event_invites_token_unique" UNIQUE("token"),
	CONSTRAINT "event_invites_event_user_uq" UNIQUE("event_id","invited_user_id"),
	CONSTRAINT "event_invites_event_email_uq" UNIQUE("event_id","email"),
	CONSTRAINT "event_invites_target_ck" CHECK (("event_invites"."invited_user_id" is null) <> ("event_invites"."email" is null))
);
--> statement-breakpoint
ALTER TABLE "event_invites" ADD CONSTRAINT "event_invites_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_invites" ADD CONSTRAINT "event_invites_invited_user_id_users_id_fk" FOREIGN KEY ("invited_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_invites" ADD CONSTRAINT "event_invites_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "event_invites_email_idx" ON "event_invites" USING btree ("email");