ALTER TABLE "club_edits" ADD COLUMN "tiers" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "club_edits" ADD COLUMN "squad_markers" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "club_edits" ADD COLUMN "colours" text;--> statement-breakpoint
ALTER TABLE "club_edits" ADD COLUMN "age_bands" text;--> statement-breakpoint
ALTER TABLE "club_edits" ADD COLUMN "branches" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "club_edits" ADD COLUMN "about" text;--> statement-breakpoint
ALTER TABLE "club_edits" ADD COLUMN "sources" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "clubs" ADD COLUMN "tiers" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "clubs" ADD COLUMN "squad_markers" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "clubs" ADD COLUMN "colours" text;--> statement-breakpoint
ALTER TABLE "clubs" ADD COLUMN "age_bands" text;--> statement-breakpoint
ALTER TABLE "clubs" ADD COLUMN "branches" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "clubs" ADD COLUMN "about" text;--> statement-breakpoint
ALTER TABLE "clubs" ADD COLUMN "sources" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "clubs" ADD COLUMN "knowledge_read_at" timestamp with time zone;