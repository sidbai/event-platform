-- Old team URLs have to keep working after a merge.
--
-- A connector makes a row per event, so one side becomes five teams with five
-- slugs, and every fixture on the site links to one of them. Merging without
-- this turns roughly two thousand links into 404s — including whatever a
-- search engine has already indexed.
CREATE TABLE IF NOT EXISTS "team_slugs" (
  "slug" text PRIMARY KEY NOT NULL,
  "team_id" uuid NOT NULL REFERENCES "teams"("id") ON DELETE CASCADE,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "team_slugs_team_id_idx" ON "team_slugs" ("team_id");
