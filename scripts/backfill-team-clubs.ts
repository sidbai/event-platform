import { config } from "dotenv";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";

// Must run before the db module is loaded — it reads DATABASE_URL at import
// time, and static imports hoist above this call. Hence the dynamic imports
// inside main(), same as the seeders.
config({ path: ".env.local" });

/**
 * Places the teams a connector created: under a club, or outside every club.
 *
 *   pnpm db:backfill:clubs              # says what it would do, changes nothing
 *   pnpm db:backfill:clubs --apply
 *
 * Every imported team starts as 'unknown', which is honest but useless: it is
 * in neither category on /teams and has no club crest to fall back to. The
 * admin queue exists to work through them by hand, and for 966 rows that is a
 * long afternoon. This does the part that needs no judgment.
 *
 * Three steps, in this order, because each depends on the one before:
 *
 *   1. Teams created for a named event become 'independent'. King Juan Cup
 *      sides are put together for the cup and belong to no club, and without
 *      being told so they would sit in the queue forever waiting for a club
 *      that does not exist.
 *
 *   2. Teams whose names reach a club get filed under it, using the same
 *      matcher as /admin/clubs. By default only where an approved alias
 *      matches — an alias is a decision somebody made, while a name match is
 *      the matcher's guess and belongs in front of a person. --names includes
 *      the guesses.
 *
 *   3. Teams with no crest of their own take their club's.
 *
 * On step 3: the pages already fall back to the club's crest at render, so
 * this is not what makes logos appear — it copies the URL into the row for
 * anything that reads the column directly. A copy does not follow the club
 * when it changes its logo, so re-running with --refresh-crests brings every
 * inherited crest back up to date. A crest that matches no club's is left
 * alone: that one is the team's own.
 *
 * Safe to re-run. Nothing here overwrites an answer somebody has already
 * given: a team that is already 'club' or 'independent' is skipped.
 */

const APPLY = process.argv.includes("--apply");
const WITH_NAMES = process.argv.includes("--names");
const REFRESH_CRESTS = process.argv.includes("--refresh-crests");

/** Teams created for this event are community teams. */
const COMMUNITY_EVENT =
  process.argv.find((a) => a.startsWith("--community-event="))?.split("=")[1] ??
  "king-juan-cup-2026";

async function main() {
  const { db } = await import("../src/db");
  const { clubAliases, clubs, events, teams } = await import("../src/db/schema");
  const { clubIndex, matchClub } = await import("../src/features/clubs/matching");

  const dry = APPLY ? "" : "  (dry run — pass --apply to write)";
  console.log(`Backfilling team affiliations${dry}\n`);

  // --- 1. community teams -------------------------------------------------

  const event = await db.query.events.findFirst({
    where: eq(events.slug, COMMUNITY_EVENT),
    columns: { id: true, title: true },
  });

  if (!event) {
    console.log(`No event "${COMMUNITY_EVENT}" — skipping the community step.`);
  } else {
    const community = await db.query.teams.findMany({
      where: and(
        eq(teams.originEventId, event.id),
        eq(teams.affiliation, "unknown"),
      ),
      columns: { id: true, name: true },
    });
    console.log(`${event.title}: ${community.length} team(s) → independent`);
    for (const t of community.slice(0, 5)) console.log(`    ${t.name}`);
    if (community.length > 5) console.log(`    and ${community.length - 5} more`);
    if (APPLY && community.length > 0) {
      await db
        .update(teams)
        .set({ affiliation: "independent", clubId: null, updatedAt: new Date() })
        .where(inArray(teams.id, community.map((t) => t.id)));
    }
  }

  // --- 2. club teams ------------------------------------------------------

  const [clubRows, aliasRows, unplaced] = await Promise.all([
    db.select({ id: clubs.id, name: clubs.name }).from(clubs),
    db.select({ alias: clubAliases.alias, clubId: clubAliases.clubId }).from(clubAliases),
    db.query.teams.findMany({
      where: eq(teams.affiliation, "unknown"),
      columns: { id: true, name: true },
    }),
  ]);

  const aliases = new Map(aliasRows.map((r) => [r.alias, r.clubId]));
  const index = clubIndex(clubRows);
  const nameOf = new Map(clubRows.map((c) => [c.id, c.name]));

  /** clubId → team ids, for the ones this run is willing to place. */
  const filing = new Map<string, string[]>();
  let guessed = 0;

  for (const team of unplaced) {
    const hit = matchClub(team.name, aliases, index);
    if (!hit) continue;
    if (hit.because === "name") {
      guessed++;
      if (!WITH_NAMES) continue;
    }
    filing.set(hit.clubId, [...(filing.get(hit.clubId) ?? []), team.id]);
  }

  console.log(`\n${unplaced.length} team(s) with no club:`);
  const ordered = [...filing].sort((a, b) => b[1].length - a[1].length);
  for (const [clubId, ids] of ordered) {
    console.log(`    ${ids.length.toString().padStart(4)}  → ${nameOf.get(clubId)}`);
  }
  if (!WITH_NAMES && guessed > 0) {
    console.log(
      `    ${guessed} more match a club by name only — pass --names to include\n` +
        `    them, or confirm them at /admin/clubs where you can see the names.`,
    );
  }

  if (APPLY) {
    for (const [clubId, ids] of filing) {
      await db
        .update(teams)
        .set({ clubId, affiliation: "club", updatedAt: new Date() })
        .where(inArray(teams.id, ids));
    }
  }

  // --- 3. crests ----------------------------------------------------------

  /*
   * Whose crest a team is wearing, told from where the file lives.
   *
   * uploadPrefix puts a club's logo under clubs/<club-slug>/ and a team's own
   * under crests/<team-slug>/, so the path says which this is. Comparing
   * against the club's current URL instead does not work: the moment a club
   * uploads a new logo its teams hold a URL that matches no club, and the
   * refresh this flag exists for skips every one of them.
   *
   * A crest that is not under clubs/ was uploaded for that team and is never
   * touched — guessing wrong would quietly delete somebody's own badge.
   */
  const inherited = sql`${teams.crestUrl} like '%/clubs/%'`;
  const needsCrest = await db
    .select({ id: teams.id, clubCrest: clubs.crestUrl })
    .from(teams)
    .innerJoin(clubs, eq(clubs.id, teams.clubId))
    .where(
      and(
        sql`${clubs.crestUrl} is not null`,
        REFRESH_CRESTS
          ? sql`(${teams.crestUrl} is null or ${inherited})`
          : isNull(teams.crestUrl),
        sql`${teams.crestUrl} is distinct from ${clubs.crestUrl}`,
      ),
    );

  console.log(
    `\n${needsCrest.length} team(s) take their club's crest` +
      (REFRESH_CRESTS ? " (including ones already inherited)" : ""),
  );

  if (APPLY) {
    for (const row of needsCrest) {
      await db
        .update(teams)
        .set({ crestUrl: row.clubCrest, updatedAt: new Date() })
        .where(eq(teams.id, row.id));
    }
  }

  const [{ n: left }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(teams)
    .where(eq(teams.affiliation, "unknown"));

  console.log(
    APPLY
      ? `\nDone. ${left} team(s) still unplaced — they are the queue at /admin/clubs.`
      : `\nNothing written. ${left} team(s) are unplaced today.`,
  );
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
