import { config } from "dotenv";

config({ path: ".env.local" });

/**
 * Every team name held up against what its club says about its own naming.
 *
 *   pnpm db:teams:audit
 *   pnpm db:teams:audit --check=unknown-word
 *   pnpm db:teams:audit --club=highline-premier-fc
 *
 * Read-only. It writes nothing, proposes nothing and merges nothing — the
 * output is a list to read, grouped by how often each thing happens, because
 * one team with an odd word is a typo and forty is a level nobody read.
 *
 * Run it after adding profiles: the fastest way to find out where the
 * knowledge base is thin is to hold it against two and a half thousand real
 * names and see what it cannot account for.
 */
function flag(name: string): string | undefined {
  return process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=").slice(1).join("=");
}

async function main() {
  const { db } = await import("../src/db");
  const { teams, clubs, clubAliases } = await import("../src/db/schema");
  const { eq } = await import("drizzle-orm");
  const { auditTeam, groupFindings } = await import("../src/features/clubs/knowledge/audit");
  const { profileFor, allProfiles } = await import("../src/features/clubs/knowledge/store");

  const onlyClub = flag("club");
  const onlyCheck = flag("check");
  const limit = Number(flag("examples") ?? 3);

  /*
   * One pass, and only the columns the checks read. A full read of this table
   * repeated through an evening once exhausted the month's transfer allowance
   * and took the site down, so it is worth being deliberate even here.
   */
  const rows = await db
    .select({
      slug: teams.slug,
      name: teams.name,
      birthYears: teams.birthYears,
      clubSlug: clubs.slug,
      clubName: clubs.name,
      clubShortName: clubs.shortName,
    })
    .from(teams)
    .leftJoin(clubs, eq(clubs.id, teams.clubId));

  /*
   * Every name a club goes by. `club_aliases` is exactly this record — the
   * forms an importer has already been told mean this club — so the audit
   * reads it rather than re-deriving it and disagreeing.
   */
  const aliasRows = await db
    .select({ alias: clubAliases.alias, slug: clubs.slug })
    .from(clubAliases)
    .leftJoin(clubs, eq(clubs.id, clubAliases.clubId));
  const aliasesBySlug = new Map<string, string[]>();
  for (const a of aliasRows) {
    if (!a.slug) continue;
    aliasesBySlug.set(a.slug, [...(aliasesBySlug.get(a.slug) ?? []), a.alias]);
  }

  const wanted = onlyClub ? rows.filter((r) => r.clubSlug === onlyClub) : rows;
  const findings = wanted.flatMap((team) =>
    auditTeam(
      {
        ...team,
        birthYears: team.birthYears ?? [],
        clubNames: [
          team.clubName,
          team.clubShortName,
          ...(team.clubSlug ? (aliasesBySlug.get(team.clubSlug) ?? []) : []),
        ].filter((n): n is string => Boolean(n)),
      },
      team.clubSlug ? profileFor(team.clubSlug) : null,
    ),
  );

  const groups = groupFindings(
    onlyCheck ? findings.filter((f) => f.check === onlyCheck) : findings,
  );

  const counts = new Map<string, number>();
  for (const f of findings) counts.set(f.check, (counts.get(f.check) ?? 0) + 1);

  console.log(
    `${wanted.length} team(s), ${allProfiles().length} club profile(s).\n` +
      [...counts]
        .sort((a, b) => b[1] - a[1])
        .map(([check, n]) => `  ${String(n).padStart(5)}  ${check}`)
        .join("\n"),
  );

  const shown = groups.filter((g) => g.check !== "no-club").slice(0, 60);
  if (shown.length) {
    console.log("\nGrouped, commonest first — a big count is a gap in the profile:\n");
    for (const g of shown) {
      const head = `${String(g.count).padStart(4)}  ${g.check === "no-profile" ? "no profile for" : ""}${
        g.check === "no-profile" ? "" : `"${g.about}"`
      }`;
      console.log(`${head}  ${g.clubSlug ?? ""}`);
      if (g.check !== "no-profile") {
        for (const e of g.examples.slice(0, limit)) console.log(`        ${e}`);
      }
    }
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
