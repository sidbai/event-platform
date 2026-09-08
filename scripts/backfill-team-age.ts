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
 * Two sources, and the run says which gave what.
 *
 * A name that states its years is taken at its word. A name that states only
 * a U-number is turned into years using the season its event belongs to,
 * which is defensible here because the imports check it themselves: across
 * six tournaments from May to September 2026, 182 of the 185 teams naming
 * both a U-number and their birth years put U + first year at 2026. The
 * derivation reproduces what those names already say.
 *
 * Never overwrites a value someone may have set by hand. The one exception is
 * widening a single stored year into the pair its own name states — three
 * teams write the pair oldest-last ("Olympus 2010/09"), which an earlier
 * parser read as one year, and adding the missing year contradicts nobody.
 */

const APPLY = process.argv.includes("--apply");

async function main() {
  const { db } = await import("../src/db");
  const { teams } = await import("../src/db/schema");
  const { eventDivisions, eventTeams, events } = await import("../src/db/schema");
  const {
    birthYearsForAgeGroup,
    formatBirthYears,
    parseAgeGroup,
    parseBirthYears,
    parseGender,
    seasonYearOf,
  } = await import("../src/features/teams/age");

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

  /*
   * The earliest event each team played, for the season its age group belongs
   * to. Earliest rather than latest: a team imported once and seen again a
   * year later was named for the season it first appeared in, and its name is
   * what is being read here.
   *
   * A separate grouped query rather than a correlated subquery — the latter
   * has to be written as raw SQL against three tables and Postgres called the
   * column reference ambiguous, which is a lot of risk for one column.
   */
  /*
   * The flight each team was entered in, which names a gender and an age
   * group even where the team's own name says neither. Every team here with
   * no gender was in a division that named one.
   */
  const divisionByTeam = new Map<string, string>(
    (
      await db
        .select({ teamId: eventTeams.teamId, name: eventDivisions.name })
        .from(eventTeams)
        .innerJoin(eventDivisions, eq(eventDivisions.id, eventTeams.divisionId))
    ).map((r) => [r.teamId, r.name] as const),
  );

  const firstEventByTeam = new Map<string, Date>(
    (
      await db
        .select({
          teamId: eventTeams.teamId,
          startsAt: sql<Date | null>`min(${events.startsAt})`,
        })
        .from(eventTeams)
        .innerJoin(events, eq(events.id, eventTeams.eventId))
        .groupBy(eventTeams.teamId)
    ).flatMap((r) => (r.startsAt ? [[r.teamId, new Date(r.startsAt)] as const] : [])),
  );

  let years = 0;
  let derived = 0;
  let widened = 0;
  let genders = 0;
  const shown: string[] = [];

  for (const team of rows) {
    const stated = parseBirthYears(team.name);
    let nextYears: number[] = [];
    let how = "";

    if (team.birthYears.length === 0) {
      if (stated.length > 0) {
        nextYears = stated;
        how = "named";
        years++;
      } else {
        // Only a U-number: derive it from the season the event belongs to.
        const u =
          parseAgeGroup(team.name) ?? parseAgeGroup(divisionByTeam.get(team.id) ?? "");
        const first = firstEventByTeam.get(team.id);
        const season = first ? seasonYearOf(first) : null;
        if (u !== null && season !== null) {
          nextYears = birthYearsForAgeGroup(u, season);
          how = `U${u} in ${season}`;
          derived++;
        }
      }
    } else if (
      team.birthYears.length === 1 &&
      stated.length === 2 &&
      stated.includes(team.birthYears[0])
    ) {
      // "Olympus 2010/09" — the pair written oldest-last, stored as one year
      // by an earlier parser. Adding the year its own name states.
      nextYears = stated;
      how = "widened";
      widened++;
    }

    const division = divisionByTeam.get(team.id) ?? null;
    const nextGender = team.gender
      ? null
      : (parseGender(team.name) ?? parseGender(division ?? ""));
    if (nextYears.length === 0 && !nextGender) continue;
    if (nextGender) genders++;

    if (shown.length < 8) {
      shown.push(
        `    ${team.name.slice(0, 40).padEnd(42)}` +
          `${(formatBirthYears(nextYears) ?? "—").padEnd(11)}` +
          `${(how || "—").padEnd(14)}${nextGender ?? "—"}`,
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
    `\n${years} team(s) get birth years from their own name` +
      `\n${derived} more from a U-number and the event's season` +
      `\n${widened} corrected from one year to the pair their name states` +
      `\n${genders} get a gender, out of ${rows.length} teams.`,
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
