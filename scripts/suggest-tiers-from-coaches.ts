import { config } from "dotenv";

// Must run before the db module is loaded — it reads DATABASE_URL at import
// time, and static imports hoist above this call.
config({ path: ".env.local" });

import { readFile } from "node:fs/promises";
import path from "node:path";

/**
 * A tier for a team, argued from who coaches it.
 *
 *   pnpm db:teams:suggest-tiers            # dry run, prints the argument
 *   pnpm db:teams:suggest-tiers --apply    # writes teams.tier where it is null
 *
 * A league lists a head coach beside each entry; a club's own website lists
 * which side each coach runs. Put together: "Eastside F.C. - BU10 Red" with
 * Joshua Chasan, and Eastside's page saying Josh Chasan coaches BU10 Red, is
 * a tier the name already stated — but "Sound Football Club B14/15 A" with
 * David Hartshorn, on a site that lists him only as a director, is not, and
 * "Mt. Rainier FC B13/14" with Tyler Williams, whom the club lists on Boys
 * U13 Academy-1, is a tier the name never said.
 *
 * Only that last case is worth a write, and only when the club's roster
 * names exactly one tier for that coach in that age group and gender. Two
 * candidates is a question for a person; none is nothing. Never overwrites
 * a tier already set, by anyone, for any reason.
 */

const APPLY = process.argv.includes("--apply");

type Coach = { name: string; role: string | null; ageGroups: string[] };
type Profile = { slug: string; coaches: Coach[] };

/** What a roster line says about who it is for: "BU10 Red", "Girls 2013". */
function readsAs(line: string, seasonYear: number): { gender: string | null; age: number | null } {
  const gender = /\b(g|girls|gu)\b|\bg\d|\bgu\d/i.test(line)
    ? "girls"
    : /\b(b|boys|bu)\b|\bb\d|\bbu\d/i.test(line)
      ? "boys"
      : null;
  const u = /\bU-?(\d{1,2})\b/i.exec(line);
  const year = /\b(20[01]\d)\b/.exec(line) ?? /\b[BG](\d{2})\b/i.exec(line);
  const age = u
    ? Number(u[1])
    : year
      ? seasonYear - (year[1].length === 2 ? 2000 + Number(year[1]) : Number(year[1]))
      : null;
  return { gender, age };
}

async function main() {
  const { db } = await import("../src/db");
  const { clubs, eventTeams, events, teams } = await import("../src/db/schema");
  const { and, eq, isNotNull, isNull } = await import("drizzle-orm");
  const { sameCoach } = await import("../src/features/teams/binding");
  const { parseTier } = await import("../src/features/teams/naming");
  const { seasonYearOf } = await import("../src/features/teams/age");

  const profiles = JSON.parse(
    await readFile(path.join(process.cwd(), "src/features/clubs/knowledge/profiles.json"), "utf8"),
  ) as Record<string, Profile>;

  const rows = await db
    .select({
      teamId: teams.id,
      name: teams.name,
      gender: teams.gender,
      birthYears: teams.birthYears,
      clubSlug: clubs.slug,
      coach: eventTeams.coach,
      startsAt: events.startsAt,
      event: events.title,
    })
    .from(eventTeams)
    .innerJoin(teams, eq(teams.id, eventTeams.teamId))
    .innerJoin(clubs, eq(clubs.id, teams.clubId))
    .innerJoin(events, eq(events.id, eventTeams.eventId))
    .where(and(isNotNull(eventTeams.coach), isNull(teams.tier)));

  const proposals: { teamId: string; name: string; tier: string; because: string }[] = [];
  const questions: string[] = [];

  for (const r of rows) {
    const profile = profiles[r.clubSlug];
    if (!profile || !r.coach || !r.startsAt) continue;
    const season = seasonYearOf(r.startsAt);
    const age = r.birthYears.length ? season - Math.min(...r.birthYears) : null;
    const lines = profile.coaches
      .filter((c) => sameCoach(c.name, r.coach!))
      .flatMap((c) => c.ageGroups.map((line) => ({ coach: c.name, line })));
    const fitting = lines.filter(({ line }) => {
      const said = readsAs(line, season);
      if (said.gender && r.gender && said.gender !== r.gender) return false;
      if (said.age !== null && age !== null && said.age !== age) return false;
      return true;
    });
    const tiers = new Map<string, string>();
    for (const { coach, line } of fitting) {
      const tier = parseTier(line);
      if (tier) tiers.set(tier, `${coach} coaches ${line}`);
    }
    if (tiers.size === 1) {
      const [tier, because] = [...tiers.entries()][0];
      proposals.push({ teamId: r.teamId, name: r.name, tier, because: `${because} (${r.event})` });
    } else if (tiers.size > 1) {
      questions.push(`${r.name}: ${[...tiers.values()].join("; ")}`);
    }
  }

  console.log(`${rows.length} entries name a coach on a team with no tier.`);
  console.log(`${proposals.length} propose one tier; ${questions.length} propose more than one.\n`);
  for (const p of proposals) console.log(`  ${p.name.padEnd(48)} → ${p.tier.padEnd(12)} ${p.because}`);
  if (questions.length) {
    console.log("\nMore than one reading — a person's call:");
    for (const q of questions) console.log(`  ${q}`);
  }

  if (!APPLY) {
    console.log("\nDry run. --apply writes the single-reading tiers where teams.tier is null.");
    return;
  }
  let written = 0;
  for (const p of proposals) {
    const [row] = await db
      .update(teams)
      .set({ tier: p.tier })
      .where(and(eq(teams.id, p.teamId), isNull(teams.tier)))
      .returning({ id: teams.id });
    if (row) written++;
  }
  console.log(`\n${written} tier(s) written.`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
