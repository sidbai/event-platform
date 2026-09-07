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
 * Only groups the duplicate finder calls "same source id" — the platform's
 * own identifier for a team, or the paste importer's, saying these rows are
 * one team. Name matches are deliberately left alone: two clubs in a region
 * both fielding a "Warriors" is exactly the merge nobody can undo, and that
 * is what /admin/teams and a person reading the names are for.
 *
 * The case this exists for: 74 groups appeared at once when the importer
 * stopped keying teams by division, which is a lot of clicking for a
 * decision with no judgment in it.
 */

const APPLY = process.argv.includes("--apply");

async function main() {
  const { duplicateTeamGroups } = await import("../src/features/teams/merge-queries");
  const { mergeTeams } = await import("../src/features/teams/merge");

  const groups = (await duplicateTeamGroups()).filter(
    (g) => g.because === "same source id",
  );
  const rows = groups.reduce((n, g) => n + g.losers.length, 0);

  console.log(
    `${groups.length} group(s) share a source id, ${rows} row(s) to fold in` +
      `${APPLY ? "" : "  (dry run — pass --apply to write)"}\n`,
  );

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
