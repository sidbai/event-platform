import { config } from "dotenv";

// Must run before the db module is loaded — it reads DATABASE_URL at import
// time, and static imports hoist above this call.
config({ path: ".env.local" });

/**
 * Put back a team a merge absorbed.
 *
 *   pnpm db:teams:unmerge                 # what is on record
 *   pnpm db:teams:unmerge <merge id>      # what undoing it would do
 *   pnpm db:teams:unmerge <merge id> --apply
 *
 * The work is in features/teams/unmerge.ts, where it can be tested against a
 * real database. This is the way in.
 */

const APPLY = process.argv.includes("--apply");
const mergeId = process.argv.slice(2).find((a) => !a.startsWith("-"));

async function main() {
  const { db } = await import("../src/db");
  const { planUnmerge, unmergeTeam } = await import("../src/features/teams/unmerge");

  if (!mergeId) {
    const rows = await db.query.teamMerges.findMany();
    rows.sort((a, b) => b.mergedAt.getTime() - a.mergedAt.getTime());
    console.log(`${rows.length} merge(s) on record, newest first:\n`);
    for (const row of rows.slice(0, 40)) {
      const team = row.team as { name?: string };
      console.log(
        `  ${row.id}  ${row.mergedAt.toISOString().slice(0, 16).replace("T", " ")}  ` +
          `${row.undoneAt ? "undone " : "       "} ${team.name ?? "?"}`,
      );
    }
    console.log("\nPass one of these ids to see what undoing it would do.");
    process.exit(0);
  }

  const plan = await planUnmerge(mergeId);
  console.log(`Putting back: ${plan.team.name}   /teams/${plan.team.slug}\n`);
  console.log(`  ${plan.matches} fixture(s) move back`);
  console.log(
    `  ${plan.entriesMoved} event entr(ies) move back, ${plan.entriesRestored} re-created`,
  );
  console.log(
    `  ${plan.registrations} registration(s), ${plan.offers} offer(s), ${plan.members} member(s)`,
  );
  console.log(
    `  ${plan.slugs.length} redirect(s) removed` +
      (plan.alias ? `, alias "${plan.alias}" removed` : ""),
  );
  if (plan.slugTaken) {
    console.log(
      `\n  /teams/${plan.team.slug} is a live team now — the merge gave that\n` +
        `  address to the survivor. This row comes back at the next free\n` +
        `  number instead; everything else about it is restored.`,
    );
  }

  console.log(
    "\nWhere a row belongs, not what it looked like: a score entered on a moved\n" +
      "fixture since the merge stays as it is now.",
  );

  if (!APPLY) {
    console.log("\nDry run. Pass --apply to write.");
    process.exit(0);
  }

  await unmergeTeam(mergeId);
  console.log(`\nPut back ${plan.team.name} at /teams/${plan.team.slug}.`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
