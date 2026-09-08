import { readFileSync } from "node:fs";

import { config } from "dotenv";

config({ path: ".env.local" });

/**
 * Put an edited spreadsheet back.
 *
 *   pnpm db:teams:import team-facts.csv            # says what would change
 *   pnpm db:teams:import team-facts.csv --apply
 *
 * Every cell is checked before anything is written, and a bad one stops that
 * row rather than the run: a spreadsheet comes back from a person, so "U13"
 * in the birth years column and "Boys " with a space are what happens, and
 * neither should cost the other 200 rows.
 *
 * Only three columns are read. The slug identifies the row and is never
 * written; the name and club are there so the file makes sense to read, and
 * are ignored on the way back — changing a club is a merge-shaped decision
 * that belongs at /admin/clubs.
 */

const APPLY = process.argv.includes("--apply");
const FILE = process.argv[2];

const GENDERS = new Set(["boys", "girls", "coed"]);

async function main() {
  if (!FILE || FILE.startsWith("--")) {
    throw new Error("usage: pnpm db:teams:import <file.csv> [--apply]");
  }

  const { db } = await import("../src/db");
  const { teams } = await import("../src/db/schema");
  const { eq, inArray } = await import("drizzle-orm");
  const { parseBirthYearsInput, formatBirthYears } = await import(
    "../src/features/teams/age"
  );
  const { parseCsv } = await import("../src/features/teams/csv");

  const rows = parseCsv(readFileSync(FILE, "utf8"));
  if (rows.length === 0) throw new Error(`${FILE} has no rows`);

  const slugs = rows.map((r) => r.slug).filter(Boolean);
  const known = await db
    .select({
      slug: teams.slug,
      id: teams.id,
      name: teams.name,
      birthYears: teams.birthYears,
      gender: teams.gender,
      tier: teams.tier,
    })
    .from(teams)
    .where(inArray(teams.slug, slugs.length > 0 ? slugs : [""]));
  const bySlug = new Map(known.map((t) => [t.slug, t]));

  const problems: string[] = [];
  const changes: { id: string; slug: string; was: string; now: string; set: Record<string, unknown> }[] = [];

  for (const [i, row] of rows.entries()) {
    const line = i + 2; // header is line 1
    const team = bySlug.get(row.slug);
    if (!team) {
      problems.push(`line ${line}: no team with slug "${row.slug}"`);
      continue;
    }

    const set: Record<string, unknown> = {};
    const was: string[] = [];
    const now: string[] = [];

    const years = parseBirthYearsInput(row.birth_years ?? "");
    if (!years.ok) {
      problems.push(`line ${line} (${team.name}): ${years.error}`);
      continue;
    }
    if (formatBirthYears(years.years) !== formatBirthYears(team.birthYears)) {
      set.birthYears = years.years;
      was.push(`years ${formatBirthYears(team.birthYears) ?? "—"}`);
      now.push(`years ${formatBirthYears(years.years) ?? "—"}`);
    }

    const gender = (row.gender ?? "").toLowerCase();
    if (gender !== "" && !GENDERS.has(gender)) {
      problems.push(`line ${line} (${team.name}): gender is boys, girls or coed`);
      continue;
    }
    if ((gender || null) !== team.gender) {
      set.gender = gender || null;
      was.push(`gender ${team.gender ?? "—"}`);
      now.push(`gender ${gender || "—"}`);
    }

    const tier = (row.tier ?? "").trim();
    if ((tier || null) !== team.tier) {
      set.tier = tier || null;
      was.push(`tier ${team.tier ?? "—"}`);
      now.push(`tier ${tier || "—"}`);
    }

    if (Object.keys(set).length > 0) {
      changes.push({ id: team.id, slug: team.slug, was: was.join(", "), now: now.join(", "), set });
    }
  }

  console.log(
    `${rows.length} row(s) read, ${changes.length} team(s) would change` +
      `${APPLY ? "" : "  — dry run, pass --apply to write"}\n`,
  );
  for (const c of changes.slice(0, 15)) {
    console.log(`    ${c.slug}\n        ${c.was}  →  ${c.now}`);
  }
  if (changes.length > 15) console.log(`    …and ${changes.length - 15} more`);

  if (problems.length > 0) {
    console.log(`\n${problems.length} row(s) skipped:`);
    for (const p of problems.slice(0, 15)) console.log(`    ${p}`);
    if (problems.length > 15) console.log(`    …and ${problems.length - 15} more`);
  }

  if (!APPLY) {
    console.log("\nNothing written.");
    process.exit(0);
  }

  for (const c of changes) {
    await db
      .update(teams)
      .set({ ...c.set, updatedAt: new Date() })
      .where(eq(teams.id, c.id));
  }
  console.log(`\nUpdated ${changes.length} team(s).`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
