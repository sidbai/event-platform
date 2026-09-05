CREATE TYPE "public"."club_league" AS ENUM('rcl', 'wpl');--> statement-breakpoint
ALTER TABLE "clubs" ADD COLUMN "league" "club_league";