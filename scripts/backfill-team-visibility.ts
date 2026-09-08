import { config } from "dotenv";

// Must run before the db module is loaded — it reads DATABASE_URL at import
// time, and static imports hoist above this call.
config({ path: ".env.local" });

/**
 * Makes every team created for an event say it is listed.
 *
 *   pnpm db:backfill:visibility            # counts, changes nothing
 *   pnpm db:backfill:visibility --apply
 *
 * These rows were written 'private', which never meant "keep it secret" — it
 * meant "we did not put this here on purpose". The directory, the team page
 * and the sitemap each carried a second clause to let them through anyway, so
 * the data said one thing and all three rules said another.
 *
 * Nothing becomes newly visible. Every row this touches is already listed and
 * already openable by anyone; this only writes down what was already true, so
 * the code can stop asking where a team came from before deciding.
 *
 * Deliberately narrow: only rows with an origin event. A team a person made
 * and marked private is the one case where 'private' meant what it says, and
 * it is left exactly as it is.
 */

const APPLY = process.argv.includes("--apply");

async function main() {
  const { db } = await import("../src/db");
  const { teams } = await import("../src/db/schema");
  const { and, eq, isNotNull, isNull, sql } = await import("drizzle-orm");

  const imported = and(eq(teams.visibility, "private"), isNotNull(teams.originEventId));

  const [{ n: toChange }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(teams)
    .where(imported);

  const [{ n: leftAlone }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(teams)
    .where(and(eq(teams.visibility, "private"), isNull(teams.originEventId)));

  console.log(
    `${toChange} team(s) created for an event will be marked listed` +
      `${APPLY ? "" : "  — dry run, pass --apply to write"}`,
  );
  console.log(
    `    ${leftAlone} private team(s) made by a person are left alone.\n`,
  );

  if (!APPLY) {
    console.log("Nothing written.");
    process.exit(0);
  }

  const changed = await db
    .update(teams)
    .set({ visibility: "public" })
    .where(imported)
    .returning({ id: teams.id });

  console.log(`Marked ${changed.length} team(s) listed.`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
