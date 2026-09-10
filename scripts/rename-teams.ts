import { config } from "dotenv";
import { eq, sql } from "drizzle-orm";

// Must run before the db module is loaded — it reads DATABASE_URL at import
// time, and static imports hoist above this call.
config({ path: ".env.local" });

/**
 * Writes every club team's name the one way.
 *
 *   pnpm db:teams:rename                 # says what it would do
 *   pnpm db:teams:rename --all           # every rename, not a sample
 *   pnpm db:teams:rename --apply
 *
 *   <club> <program> <B|G>yy/yy <tier> <the rest>
 *
 * Matching does not depend on the printed name — imports bind on facts
 * (teams/binding.ts) and every name a team has arrived under is kept in
 * team_aliases and event_teams.source_name — so a rename does not orphan a
 * fixture. That is the whole reason this can run at all.
 *
 * The dry run is the point. This touches 1,484 rows, and the only way to
 * know a rewrite says as much as the name it replaces is to read them.
 */

const APPLY = process.argv.includes("--apply");
const ALL = process.argv.includes("--all");

async function main() {
  const { db } = await import("../src/db");
  const { clubs, clubAliases, teams } = await import("../src/db/schema");
  const { canonicalName } = await import("../src/features/teams/canonical-name");

  const aliasRows = await db
    .select({ clubId: clubAliases.clubId, alias: clubAliases.alias })
    .from(clubAliases);
  const aliasesFor = new Map<string, string[]>();
  for (const row of aliasRows) {
    aliasesFor.set(row.clubId, [...(aliasesFor.get(row.clubId) ?? []), row.alias]);
  }

  const rows = await db
    .select({
      id: teams.id,
      name: teams.name,
      gender: teams.gender,
      birthYears: teams.birthYears,
      tier: teams.tier,
      program: teams.program,
      clubId: clubs.id,
      clubName: clubs.name,
      clubSlug: clubs.slug,
      clubShortName: clubs.shortName,
    })
    .from(teams)
    // Only a club's teams. A side with no club in the directory has no fixed
    // vocabulary behind its name, and nothing to normalise it against.
    .innerJoin(clubs, eq(clubs.id, teams.clubId))
    .orderBy(teams.name);

  const changes: { id: string; from: string; to: string }[] = [];
  let unchanged = 0;
  let shortened = 0;

  for (const team of rows) {
    const to = canonicalName({
      name: team.name,
      club: {
        name: team.clubName,
        slug: team.clubSlug,
        shortName: team.clubShortName,
        aliases: aliasesFor.get(team.clubId) ?? [],
      },
      gender: team.gender,
      birthYears: team.birthYears,
      tier: team.tier,
      program: team.program,
    });
    if (to === team.name) {
      unchanged++;
      continue;
    }
    changes.push({ id: team.id, from: team.name, to });
    if (to.length < team.name.length * 0.6) shortened++;
  }

  const sample = ALL ? changes : changes.slice(0, 60);
  for (const c of sample) console.log(`  ${c.from}\n→ ${c.to}\n`);

  console.log(
    `${changes.length} rename(s), ${unchanged} already canonical, out of ${rows.length} club teams.`,
  );
  // The failure worth catching before a write, not after: a rewrite that
  // dropped most of what the published name said.
  console.log(`${shortened} rewrite(s) lose more than 40% of the name — read those.`);
  if (!APPLY) {
    console.log("\nDry run. Pass --apply to write.");
    process.exit(0);
  }

  for (const c of changes) {
    await db
      .update(teams)
      .set({ name: c.to, updatedAt: new Date() })
      .where(eq(teams.id, c.id));
  }
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(teams)
    .where(sql`${teams.affiliation} = 'club'`);
  console.log(`\nWrote ${changes.length} name(s). ${n} club teams.`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
