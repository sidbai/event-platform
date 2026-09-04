ALTER TABLE "teams" RENAME COLUMN "claimed_by" TO "owner_id";--> statement-breakpoint
ALTER TABLE "teams" RENAME CONSTRAINT "teams_claimed_by_users_id_fk" TO "teams_owner_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "teams" DROP COLUMN "verified_at";
