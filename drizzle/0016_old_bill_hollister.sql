CREATE TYPE "public"."reviewer_role" AS ENUM('parent', 'player', 'coach');--> statement-breakpoint
ALTER TABLE "club_reviews" ADD COLUMN "reviewer_role" "reviewer_role" NOT NULL;