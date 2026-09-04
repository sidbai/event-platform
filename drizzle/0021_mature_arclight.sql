-- Generalise club reviews into a polymorphic `reviews` table, keyed
-- (subject_type, subject_id) like `discussions`, so coaches and venues can be
-- reviewed without a second copy of the table, its votes and its reports.
--
-- Hand-written: drizzle-kit cannot rename non-interactively and would drop and
-- recreate these tables, destroying every existing review.

CREATE TYPE "public"."review_subject" AS ENUM('club', 'coach');--> statement-breakpoint

-- The 1-5 rule used to be six per-column CHECKs. Ratings are now JSON, and a
-- CHECK cannot contain a subquery, so the same guarantee moves into an
-- IMMUTABLE function the constraint calls.
CREATE OR REPLACE FUNCTION review_ratings_valid(r jsonb) RETURNS boolean
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT jsonb_typeof(r) = 'object'
     AND (SELECT count(*) FROM jsonb_each(r)) > 0
     AND NOT EXISTS (
       SELECT 1
       FROM jsonb_each(r) AS e
       WHERE jsonb_typeof(e.value) <> 'number'
          OR (e.value #>> '{}')::numeric NOT BETWEEN 1 AND 5
          OR (e.value #>> '{}')::numeric <> trunc((e.value #>> '{}')::numeric)
     );
$$;--> statement-breakpoint

ALTER TABLE "club_reviews" RENAME TO "reviews";--> statement-breakpoint
ALTER TABLE "club_review_votes" RENAME TO "review_votes";--> statement-breakpoint
ALTER TABLE "club_review_reports" RENAME TO "review_reports";--> statement-breakpoint

-- Every existing row is a club review.
ALTER TABLE "reviews" ADD COLUMN "subject_type" "review_subject";--> statement-breakpoint
ALTER TABLE "reviews" ADD COLUMN "subject_id" uuid;--> statement-breakpoint
UPDATE "reviews" SET "subject_type" = 'club', "subject_id" = "club_id";--> statement-breakpoint
ALTER TABLE "reviews" ALTER COLUMN "subject_type" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "reviews" ALTER COLUMN "subject_id" SET NOT NULL;--> statement-breakpoint

-- Fold the six score columns into one JSON object, keyed exactly as
-- RATING_CATEGORIES in src/features/clubs/constants.ts.
ALTER TABLE "reviews" ADD COLUMN "ratings" jsonb;--> statement-breakpoint
UPDATE "reviews" SET "ratings" = jsonb_build_object(
  'playerDevelopment', "player_development",
  'coaching',          "coaching",
  'communication',     "communication",
  'clubCulture',       "club_culture",
  'playingTime',       "playing_time",
  'value',             "value"
);--> statement-breakpoint
ALTER TABLE "reviews" ALTER COLUMN "ratings" SET NOT NULL;--> statement-breakpoint

-- Old shape goes only after the data has been copied out of it.
ALTER TABLE "reviews" DROP CONSTRAINT "club_reviews_ratings_ck";--> statement-breakpoint
ALTER TABLE "reviews" DROP CONSTRAINT "club_reviews_club_author_uq";--> statement-breakpoint
DROP INDEX IF EXISTS "club_reviews_club_idx";--> statement-breakpoint
ALTER TABLE "reviews" DROP COLUMN "player_development";--> statement-breakpoint
ALTER TABLE "reviews" DROP COLUMN "coaching";--> statement-breakpoint
ALTER TABLE "reviews" DROP COLUMN "communication";--> statement-breakpoint
ALTER TABLE "reviews" DROP COLUMN "club_culture";--> statement-breakpoint
ALTER TABLE "reviews" DROP COLUMN "playing_time";--> statement-breakpoint
ALTER TABLE "reviews" DROP COLUMN "value";--> statement-breakpoint
-- Drops the FK to clubs with it. Nothing enforces subject_id at the database
-- level from here on, exactly as with discussions.
ALTER TABLE "reviews" DROP COLUMN "club_id";--> statement-breakpoint

ALTER TABLE "reviews" ADD CONSTRAINT "reviews_subject_author_uq" UNIQUE("subject_type","subject_id","author_id");--> statement-breakpoint
CREATE INDEX "reviews_subject_idx" ON "reviews" USING btree ("subject_type","subject_id","hidden_at");--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_ratings_ck" CHECK (review_ratings_valid("reviews"."ratings"));--> statement-breakpoint

-- Carry the primary keys and foreign keys over to the new table names.
ALTER TABLE "reviews" RENAME CONSTRAINT "club_reviews_pkey" TO "reviews_pkey";--> statement-breakpoint
ALTER TABLE "reviews" RENAME CONSTRAINT "club_reviews_author_id_users_id_fk" TO "reviews_author_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "review_votes" RENAME CONSTRAINT "club_review_votes_review_id_club_reviews_id_fk" TO "review_votes_review_id_reviews_id_fk";--> statement-breakpoint
ALTER TABLE "review_votes" RENAME CONSTRAINT "club_review_votes_user_id_users_id_fk" TO "review_votes_user_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "review_votes" RENAME CONSTRAINT "club_review_votes_review_id_user_id_pk" TO "review_votes_review_id_user_id_pk";--> statement-breakpoint
ALTER TABLE "review_reports" RENAME CONSTRAINT "club_review_reports_review_id_club_reviews_id_fk" TO "review_reports_review_id_reviews_id_fk";--> statement-breakpoint
ALTER TABLE "review_reports" RENAME CONSTRAINT "club_review_reports_reporter_id_users_id_fk" TO "review_reports_reporter_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "review_reports" RENAME CONSTRAINT "club_review_reports_review_id_reporter_id_pk" TO "review_reports_review_id_reporter_id_pk";
