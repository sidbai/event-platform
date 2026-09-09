import { config } from "dotenv";
import { eq, sql } from "drizzle-orm";

// Must run before the db module is loaded — it reads DATABASE_URL at import
// time, and static imports hoist above this call.
config({ path: ".env.local" });

/**
 * Reads the tier and the club's stream off imported team names.
 *
 *   pnpm db:backfill:naming              # says what it would do
 *   pnpm db:backfill:naming --apply
 *
 * Only clubs' teams, and only from the name. A branch — Seattle United's
 * Shoreline, Northwest and South — is read only for the club that has one,
 * because "NW" is also the whole of NW United and "South" starts South
 * Kitsap; from the name alone both clubs become Seattle United branches.
 *
 * Never overwrites a value already there, except to make it more precise:
 * a column reading "MLS Next" against a name reading "MLS Next II" is the
 * same tier abbreviated, and the fuller one is the true one.
 */

const APPLY = process.argv.includes("--apply");

async function main() {
  const { db } = await import("../src/db");
  const { clubs, teams } = await import("../src/db/schema");
  const { fullerTier, parseProgram, parseTier } = await import(
    "../src/features/teams/naming"
  );

  console.log(
    `Reading tier and program off team names${APPLY ? "" : "  (dry run — pass --apply to write)"}\n`,
  );

  const rows = await db
    .select({
      id: teams.id,
      name: teams.name,
      tier: teams.tier,
      program: teams.program,
      clubSlug: clubs.slug,
    })
    .from(teams)
    .innerJoin(clubs, eq(clubs.id, teams.clubId));

  let tiers = 0;
  let programs = 0;
  const shown: string[] = [];

  for (const team of rows) {
    /*
     * A value already there is kept, unless the name states the same tier
     * more precisely. "MLS Next" where the name says "MLS Next II" is not a
     * different opinion, it is the same one abbreviated — and left alone it
     * files six Seattle Celtic sides onto their own club's first team.
     */
    const fuller = fullerTier(team.tier, parseTier(team.name));
    const nextTier = fuller === team.tier ? null : fuller;
    const nextProgram = team.program ? null : parseProgram(team.name, team.clubSlug);
    if (!nextTier && !nextProgram) continue;

    if (nextTier) tiers++;
    if (nextProgram) programs++;
    if (shown.length < 8) {
      shown.push(
        `    ${team.name.slice(0, 42).padEnd(44)}` +
          `${(nextTier ?? "—").padEnd(14)}${nextProgram ?? "—"}`,
      );
    }

    if (APPLY) {
      await db
        .update(teams)
        .set({
          ...(nextTier ? { tier: nextTier } : {}),
          ...(nextProgram ? { program: nextProgram } : {}),
          updatedAt: new Date(),
        })
        .where(eq(teams.id, team.id));
    }
  }

  console.log(shown.join("\n"));
  console.log(
    `\n${tiers} team(s) get a tier, ${programs} get a program, out of ${rows.length} club teams.`,
  );

  if (APPLY) {
    const [{ n }] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(teams)
      .where(sql`${teams.affiliation} = 'club' and ${teams.tier} is null`);
    console.log(`${n} club team(s) name no tier — that is what their names say.`);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
