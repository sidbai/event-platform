import { config } from "dotenv";

// Must run before the db module is loaded — it reads DATABASE_URL at import
// time, and static imports hoist above this call.
config({ path: ".env.local" });

/**
 * Folds together the team rows that are mechanically the same team.
 *
 *   pnpm db:merge:teams            # says what it would do, changes nothing
 *   pnpm db:merge:teams --apply
 *
 * Two kinds, and the run counts them separately.
 *
 * Same source id: the platform's own identifier, or the paste importer's,
 * saying these rows are one team.
 *
 * Same team by the binding rule: the name matches exactly, no fact
 * contradicts, and some fact agrees — the same rule an import now applies
 * before creating anything, so the backlog is cleared the way it will stop
 * accumulating. 177 of the 191 pairs waiting when this was written.
 *
 * Name matches that the facts do not support are deliberately left alone:
 * two clubs in a region both fielding a "Warriors" is exactly the merge
 * nobody can undo, and /admin/teams and a person reading the names are what
 * that is for.
 */

const APPLY = process.argv.includes("--apply");

async function main() {
  const { duplicateTeamGroups } = await import("../src/features/teams/merge-queries");
  const { mergeTeams } = await import("../src/features/teams/merge");

  const { db } = await import("../src/db");
  const { teams } = await import("../src/db/schema");
  const { canBind } = await import("../src/features/teams/binding");
  const { inArray } = await import("drizzle-orm");

  const all = await duplicateTeamGroups();

  // Facts for everything the queue is offering, to apply the binding rule.
  const ids = [
    ...new Set(all.flatMap((g) => [g.survivor.id, ...g.losers.map((l) => l.id)])),
  ];
  const factRows = ids.length
    ? await db
        .select({
          id: teams.id,
          name: teams.name,
          clubId: teams.clubId,
          gender: teams.gender,
          birthYears: teams.birthYears,
          tier: teams.tier,
        })
        .from(teams)
        .where(inArray(teams.id, ids))
    : [];
  const facts = new Map(factRows.map((r) => [r.id, r]));

  /** Losers this run is willing to fold, with why. */
  const plan = all.flatMap((g) => {
    const survivor = facts.get(g.survivor.id);
    const take = g.losers.filter((l) => {
      if (g.because === "same source id") return true;
      const loser = facts.get(l.id);
      return survivor && loser ? canBind(survivor, loser) : false;
    });
    return take.length > 0 ? [{ ...g, losers: take }] : [];
  });

  const rows = plan.reduce((n, g) => n + g.losers.length, 0);
  const bySource = plan.filter((g) => g.because === "same source id").length;
  const held = all.reduce((n, g) => n + g.losers.length, 0) - rows;

  console.log(
    `${plan.length} group(s), ${rows} row(s) to fold in` +
      `  (${bySource} by source id, ${plan.length - bySource} by name and facts)` +
      `${APPLY ? "" : "  — dry run, pass --apply to write"}\n`,
  );
  if (held > 0) {
    console.log(
      `    ${held} row(s) left alone: the names match but no fact supports it.\n`,
    );
  }

  const groups = plan;
  for (const g of groups.slice(0, 10)) {
    console.log(`    ${g.survivor.name}  ← ${g.losers.length} more`);
  }
  if (groups.length > 10) console.log(`    and ${groups.length - 10} more`);

  if (!APPLY) {
    console.log("\nNothing written.");
    process.exit(0);
  }

  let merged = 0;
  let matches = 0;
  let dropped = 0;
  for (const g of groups) {
    const out = await mergeTeams(
      g.survivor.id,
      g.losers.map((l) => l.id),
    );
    merged += out.merged;
    matches += out.matchesMoved;
    dropped += out.entriesDropped;
  }
  console.log(
    `\nFolded ${merged} row(s) into ${groups.length} team(s); ` +
      `${matches} match(es) moved, ${dropped} duplicate entr(y/ies) dropped.`,
  );
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
