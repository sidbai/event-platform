import { config } from "dotenv";

// Must run before the db module is loaded — it reads DATABASE_URL at import
// time, and static imports hoist above this call.
config({ path: ".env.local" });

/**
 * What a league would look like once it is written, before writing it.
 *
 *   pnpm db:sync:preflight --url=<a page on the platform>
 *   pnpm db:sync:preflight --url=... --season=2026-09-01
 *
 * Reads only: it fetches the league from its platform and asks the questions
 * that cost an evening the first time round. Which clubs are missing from the
 * directory, which teams would end up sharing a name, whether any division
 * holds two cohorts, and whether the names would survive being read back.
 *
 * Run it before connecting a league, not after.
 */

const arg = (name: string) =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=").slice(1).join("=");

async function main() {
  const url = arg("url");
  if (!url) {
    console.log("Usage: pnpm db:sync:preflight --url=<page> [--season=YYYY-MM-DD]");
    process.exit(1);
  }

  const { db } = await import("../src/db");
  const { clubAliases, clubs } = await import("../src/db/schema");
  const { providerFor } = await import("../src/features/sync/run");
  const { platformOf } = await import("../src/features/sync/policy");
  const { clubDirectory, plannedTeam } = await import("../src/features/sync/planned-team");
  const { preflight, blocking } = await import("../src/features/sync/preflight");

  const platform = platformOf(url);
  const provider = platform ? providerFor(platform) : null;
  if (!provider) {
    console.log(`Nothing here reads ${url}`);
    process.exit(1);
  }
  const ref = provider.parseUrl(url);
  if (!ref) {
    console.log(`${provider.platform} does not recognise that address.`);
    process.exit(1);
  }

  console.log(`Reading ${provider.platform} — this makes real requests and takes a while.\n`);
  const result = await provider.fetch(ref);
  if (!result.ok) {
    console.log(`Could not read it: ${result.error.kind} — ${result.error.detail}`);
    process.exit(1);
  }

  const clubRows = await db.select().from(clubs);
  const aliasRows = await db.select().from(clubAliases);
  const aliasesByClub = new Map<string, string[]>();
  for (const a of aliasRows) {
    aliasesByClub.set(a.clubId, [...(aliasesByClub.get(a.clubId) ?? []), a.alias]);
  }
  const directory = clubDirectory(
    clubRows.map((c) => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      shortName: c.shortName,
      aliases: aliasesByClub.get(c.id) ?? [],
    })),
  );

  /*
   * The season the age groups are counted from. A league's own start date is
   * not known until it is connected, so it is given — "U12" is one cohort in
   * an autumn league and another in a June tournament.
   */
  const season = arg("season") ? new Date(arg("season")!) : new Date();

  const planned = result.data.teams.map((t) =>
    plannedTeam(t.name, t.division, directory, { seasonStart: season, gender: t.gender ?? null }),
  );
  const report = preflight(planned);

  console.log(`${report.teams} teams over ${report.divisions} divisions, ${result.data.matches.length} fixtures`);
  console.log(`counting age groups from ${season.toISOString().slice(0, 10)}\n`);

  if (report.homeless.length > 0) {
    const names = [...new Set(report.homeless.map((h) => h.published))];
    console.log(`${report.homeless.length} team(s) have no club in the directory.`);
    console.log(`They would keep their published name, and land under no club:`);
    for (const n of names.slice(0, 40)) console.log(`    ${n}`);
    if (names.length > 40) console.log(`    …and ${names.length - 40} more`);
    console.log(`  Add these at /clubs/new before connecting.\n`);
  }

  if (report.shared.length > 0) {
    console.log(`${report.shared.length} name(s) would be carried by more than one team:`);
    for (const s of report.shared.slice(0, 20)) console.log(`    ${s.name}  ×${s.count}`);
    console.log();
  }

  if (report.mixed.length > 0) {
    console.log(
      `${report.mixed.length} division(s) include a team from another age group.\n` +
        `Usually a club playing a younger squad up — read them, they are rarely wrong:`,
    );
    for (const m of report.mixed) console.log(`    ${m.division}: ${m.cohorts.join(", ")}`);
    console.log();
  }

  if (report.unstable.length > 0) {
    console.log(`${report.unstable.length} name(s) would not read back as themselves:`);
    for (const u of report.unstable.slice(0, 20)) console.log(`    ${u.written}\n      -> ${u.reread}`);
    console.log();
  }

  console.log(`clubs this league needs, by how many teams they field:`);
  for (const c of report.clubs.slice(0, 15)) console.log(`    ${String(c.teams).padStart(3)}  ${c.name}`);
  if (report.clubs.length > 15) console.log(`    …and ${report.clubs.length - 15} more`);

  console.log(
    blocking(report)
      ? `\nSomething above would land wrong. Fix it, then connect.`
      : `\nNothing here would land wrong. Connect it.`,
  );
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
