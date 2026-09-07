import { config } from "dotenv";
import { eq, sql } from "drizzle-orm";

// Must run before the db module is loaded — it reads DATABASE_URL at import
// time, and static imports hoist above this call.
config({ path: ".env.local" });

/**
 * Reads birth years and gender off the names the connectors imported.
 *
 *   pnpm db:backfill:age              # says what it would do, changes nothing
 *   pnpm db:backfill:age --apply
 *
 * Only what a name states. A U-number is never turned into birth years:
 * "U13" means one cohort in an autumn league and another in a June
 * tournament, and this column is read as a fact somebody checked.
 *
 * Never overwrites. A value already in the row was either set by hand or read
 * from a better name on an earlier run, and a team someone has corrected must
 * not be corrected back.
 */

const APPLY = process.argv.includes("--apply");

async function main() {
  const { db } = await import("../src/db");
  const { teams } = await import("../src/db/schema");
  const { parseBirthYears, parseGender, formatBirthYears } = await import(
    "../src/features/teams/age"
  );

  console.log(
    `Reading ages off team names${APPLY ? "" : "  (dry run — pass --apply to write)"}\n`,
  );

  const rows = await db
    .select({
      id: teams.id,
      name: teams.name,
      birthYears: teams.birthYears,
      gender: teams.gender,
    })
    .from(teams);

  let years = 0;
  let genders = 0;
  const shown: string[] = [];

  for (const team of rows) {
    const nextYears =
      team.birthYears.length === 0 ? parseBirthYears(team.name) : [];
    const nextGender = team.gender ? null : parseGender(team.name);
    if (nextYears.length === 0 && !nextGender) continue;

    if (nextYears.length > 0) years++;
    if (nextGender) genders++;
    if (shown.length < 8) {
      shown.push(
        `    ${team.name.slice(0, 44).padEnd(46)}` +
          `${formatBirthYears(nextYears) ?? "—"}  ${nextGender ?? "—"}`,
      );
    }

    if (APPLY) {
      await db
        .update(teams)
        .set({
          ...(nextYears.length > 0 ? { birthYears: nextYears } : {}),
          ...(nextGender ? { gender: nextGender } : {}),
          updatedAt: new Date(),
        })
        .where(eq(teams.id, team.id));
    }
  }

  console.log(shown.join("\n"));
  console.log(
    `\n${years} team(s) get birth years, ${genders} get a gender, out of ${rows.length}.`,
  );

  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(teams)
    .where(sql`cardinality(${teams.birthYears}) = 0`);
  console.log(
    APPLY
      ? `${n} team(s) still have no birth years — their names do not state any.`
      : "Nothing written.",
  );
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
