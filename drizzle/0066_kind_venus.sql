ALTER TABLE "event_attendees" ADD COLUMN "note" text;--> statement-breakpoint
INSERT INTO "event_kinds" ("slug", "label", "default_modules", "sort", "description")
VALUES ('training', 'Training session', ARRAY['attendance'], 85, 'A private or small-group session a coach opens up. RSVP to take a place.')
ON CONFLICT ("slug") DO NOTHING;
