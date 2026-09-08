import { config } from "dotenv";

config({ path: ".env.local" });

/**
 * What every team is still missing, and which of it is fixable.
 *
 *   pnpm db:teams:coverage
 *
 * Reads nothing but counts. The backfills fill in whatever a name states, so
 * after they have run, what is left divides in three: a club that is not in
 * the directory yet, a name that never said the thing, and a team somebody
 * has to open and type into. Those want different work, and a single "445
 * unplaced" hides which is which.
 *
 * Prints slugs so a row can be opened at /teams/<slug>/settings and fixed,
 * rather than leaving the reader to go looking.
 */

const SAMPLE = Number(process.env.SAMPLE ?? 8);

async function main() {
  const { db } = await import("../src/db");
  const { clubs, teams } = await import("../src/db/schema");
  const { clubIndex, matchClub } = await import("../src/features/clubs/matching");
  const { clubAliasMap } = await import("../src/features/clubs/link-queries");

  const rows = await db
    .select({
      slug: teams.slug,
      name: teams.name,
      clubId: teams.clubId,
      affiliation: teams.affiliation,
      birthYears: teams.birthYears,
      gender: teams.gender,
      tier: teams.tier,
      visibility: teams.visibility,
      originEventId: teams.originEventId,
    })
    .from(teams);

  const listable = rows.filter(
    (t) => t.visibility === "public" || t.originEventId !== null,
  );

  const clubRows = await db.select({ id: clubs.id, name: clubs.name }).from(clubs);
  const index = clubIndex(clubRows);
  const aliases = await clubAliasMap();

  const missing = {
    club: listable.filter((t) => t.affiliation === "unknown"),
    birthYears: listable.filter((t) => t.birthYears.length === 0),
    gender: listable.filter((t) => t.gender === null),
    tier: listable.filter((t) => t.affiliation === "club" && t.tier === null),
  };

  console.log(`${listable.length} teams in the directory\n`);

  /*
   * The club column splits in two, and only one half is anybody's to fix by
   * hand: a team whose name reaches a club in the directory is waiting on a
   * backfill or a click, while one whose club is not listed needs the club
   * adding first.
   */
  const reachable = missing.club.filter((t) => matchClub(t.name, aliases, index));
  const unlisted = missing.club.filter((t) => !matchClub(t.name, aliases, index));

  console.log(`no club: ${missing.club.length}`);
  console.log(
    `    ${reachable.length} whose name reaches a club we have` +
      " — pnpm db:backfill:teams --apply --names",
  );
  for (const t of reachable.slice(0, SAMPLE)) console.log(`        ${t.name}`);
  console.log(`    ${unlisted.length} whose club is not in the directory — add it at /clubs/new`);
  for (const t of unlisted.slice(0, SAMPLE)) console.log(`        ${t.name}`);

  for (const [label, list] of [
    ["no birth years", missing.birthYears],
    ["no gender", missing.gender],
    ["no tier (club teams)", missing.tier],
  ] as const) {
    console.log(`\n${label}: ${list.length}  — their names do not say; set it by hand`);
    for (const t of list.slice(0, SAMPLE)) {
      console.log(`    /teams/${t.slug}/settings   ${t.name}`);
    }
    if (list.length > SAMPLE) console.log(`    …and ${list.length - SAMPLE} more`);
  }

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
