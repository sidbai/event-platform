import { writeFileSync } from "node:fs";

import { config } from "dotenv";

config({ path: ".env.local" });

/**
 * The teams whose facts no name states, as a spreadsheet.
 *
 *   pnpm db:teams:export                 # writes team-facts.csv
 *   pnpm db:teams:export --out mine.csv
 *
 * Only what a person can answer and the backfills cannot: birth years,
 * gender, tier. Fill in the blanks, leave the rest alone, and hand it back to
 * db:teams:import.
 *
 * The slug is the key and is never edited — it survives a rename, which the
 * name deliberately does not. Current values are included rather than left
 * blank so a wrong one can be corrected, not just a missing one filled.
 */

const OUT =
  process.argv.find((a) => a.startsWith("--out="))?.split("=")[1] ??
  (process.argv.includes("--out") ? process.argv[process.argv.indexOf("--out") + 1] : null) ??
  "team-facts.csv";

async function main() {
  const { db } = await import("../src/db");
  const { clubs, teams } = await import("../src/db/schema");
  const { eq, or, isNull, sql } = await import("drizzle-orm");
  const { formatBirthYears } = await import("../src/features/teams/age");
  const { toCsv } = await import("../src/features/teams/csv");

  const rows = await db
    .select({
      slug: teams.slug,
      name: teams.name,
      club: clubs.name,
      birthYears: teams.birthYears,
      gender: teams.gender,
      tier: teams.tier,
    })
    .from(teams)
    .leftJoin(clubs, eq(clubs.id, teams.clubId))
    .where(
      or(
        sql`cardinality(${teams.birthYears}) = 0`,
        isNull(teams.gender),
        sql`${teams.affiliation} = 'club' and ${teams.tier} is null`,
      ),
    )
    .orderBy(teams.name);

  const csv = toCsv(
    ["slug", "name", "club", "birth_years", "gender", "tier"],
    rows.map((r) => [
      r.slug,
      r.name,
      r.club ?? "",
      formatBirthYears(r.birthYears) ?? "",
      r.gender ?? "",
      r.tier ?? "",
    ]),
  );

  writeFileSync(OUT, csv, "utf8");
  console.log(
    `${rows.length} team(s) written to ${OUT}.\n` +
      "Fill in birth_years (2013/2014), gender (boys/girls/coed) and tier.\n" +
      "Leave a cell as it is to change nothing. Do not edit the slug column.",
  );
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
