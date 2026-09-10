import { config } from "dotenv";

// Must run before the db module is loaded — it reads DATABASE_URL at import
// time, and static imports hoist above this call.
config({ path: ".env.local" });

/**
 * Set what a club's team names lead with, where that is not its full name.
 *
 *   pnpm db:clubs:short-name                                   # what is set
 *   pnpm db:clubs:short-name --slug=crossfire-premier --short=XF
 *   pnpm db:clubs:short-name --slug=crossfire-premier --short=XF --apply
 *   pnpm db:clubs:short-name --slug=crossfire-premier --clear --apply
 *
 * The club keeps its name. This is only the prefix a team's name is built
 * with, so the directory, search and the importer all go on seeing "Crossfire
 * Premier" while the team pages read "XF B13/14 ECNL 2".
 *
 * Nothing is renamed here. Run db:teams:rename afterwards, which is what
 * writes the new names — and read its dry run first, because this changes
 * every team the club has.
 */

const APPLY = process.argv.includes("--apply");
const CLEAR = process.argv.includes("--clear");
const arg = (name: string) =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=").slice(1).join("=");

async function main() {
  const { db } = await import("../src/db");
  const { clubs, teams } = await import("../src/db/schema");
  const { canonicalName } = await import("../src/features/teams/canonical-name");
  const { eq, isNotNull, sql } = await import("drizzle-orm");

  const slug = arg("slug");
  const short = arg("short")?.trim();

  if (!slug) {
    const set = await db
      .select({ name: clubs.name, slug: clubs.slug, shortName: clubs.shortName })
      .from(clubs)
      .where(isNotNull(clubs.shortName))
      .orderBy(clubs.name);
    console.log(`${set.length} club(s) print short in team names:\n`);
    for (const c of set) console.log(`  ${c.shortName?.padEnd(14)} ${c.name}   (${c.slug})`);
    if (set.length === 0) console.log("  none");
    console.log("\nPass --slug and --short to set one.");
    process.exit(0);
  }

  if (!CLEAR && !short) {
    console.log("Pass --short=<what team names lead with>, or --clear.");
    process.exit(1);
  }

  const club = await db.query.clubs.findFirst({
    where: eq(clubs.slug, slug),
    columns: { id: true, name: true, slug: true, shortName: true },
  });
  if (!club) {
    console.log(`No club with slug "${slug}".`);
    process.exit(1);
  }

  const next = CLEAR ? null : (short as string);
  const dry = APPLY ? "" : "  (dry run — pass --apply to write)";
  console.log(
    `${club.name}: team names lead with ` +
      `${club.shortName ? `"${club.shortName}"` : "the club's name"} → ` +
      `${next ? `"${next}"` : "the club's name"}${dry}\n`,
  );

  // What the rename would then write, so the choice is made from the result.
  const rows = await db
    .select({
      name: teams.name,
      gender: teams.gender,
      birthYears: teams.birthYears,
      tier: teams.tier,
      program: teams.program,
      aliases: sql<string[]>`coalesce(
        (select array_agg(a.alias) from club_aliases a where a.club_id = ${club.id}), '{}'
      )`,
    })
    .from(teams)
    .where(eq(teams.clubId, club.id))
    .orderBy(teams.name);

  let changed = 0;
  const sample: string[] = [];
  for (const t of rows) {
    const to = canonicalName({
      name: t.name,
      club: { name: club.name, slug: club.slug, aliases: t.aliases, shortName: next },
      gender: t.gender,
      birthYears: t.birthYears,
      tier: t.tier,
      program: t.program,
    });
    if (to === t.name) continue;
    changed++;
    if (sample.length < 8) sample.push(`  ${t.name}\n→ ${to}`);
  }

  console.log(`${changed} of ${rows.length} team name(s) would change:\n`);
  for (const s of sample) console.log(`${s}\n`);
  if (changed > sample.length) console.log(`  and ${changed - sample.length} more\n`);

  if (APPLY) {
    await db.update(clubs).set({ shortName: next }).where(eq(clubs.id, club.id));
    console.log(`Saved. Run db:teams:rename --all to write those ${changed} name(s).`);
  } else {
    console.log("Nothing written.");
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
