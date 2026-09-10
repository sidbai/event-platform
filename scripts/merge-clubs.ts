import { config } from "dotenv";

// Must run before the db module is loaded — it reads DATABASE_URL at import
// time, and static imports hoist above this call.
config({ path: ".env.local" });

/**
 * Fold one club row into another, where both turned out to be the same club.
 *
 *   pnpm db:clubs:merge --from=ifc --into=issaquah-fc
 *   pnpm db:clubs:merge --from=ifc --into=issaquah-fc --apply
 *
 * The work is in features/clubs/merge.ts, where it can be tested against a
 * real database. This is the way in.
 *
 * Run it before db:teams:rename, not after: two teams under two clubs
 * normalise to two different names and the duplicate finder never sees them.
 * Under one club they converge, and it does.
 */

const APPLY = process.argv.includes("--apply");
const arg = (name: string) =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=").slice(1).join("=");

async function main() {
  const from = arg("from");
  const into = arg("into");
  if (!from || !into) {
    console.log("Usage: pnpm db:clubs:merge --from=<slug> --into=<slug> [--apply]");
    process.exit(1);
  }

  const { planClubMerge, mergeClubs } = await import("../src/features/clubs/merge");

  const plan = await planClubMerge(from, into);
  if ("error" in plan) {
    console.log(plan.error);
    process.exit(1);
  }

  const dry = APPLY ? "" : "  (dry run — pass --apply to write)";
  console.log(`Folding ${plan.from.name} into ${plan.into.name}${dry}\n`);
  console.log(`  ${plan.teams.length} team(s) move:`);
  for (const t of plan.teams.slice(0, 12)) console.log(`      ${t.name}`);
  if (plan.teams.length > 12) console.log(`      and ${plan.teams.length - 12} more`);
  console.log(
    `\n  ${plan.aliases.length} alias(es) move: ${plan.aliases.join(", ") || "none"}`,
  );
  console.log(`  ${plan.coaches.length} coach(es), ${plan.reviews} review(s), ${plan.edits} history row(s)`);
  console.log(
    `\n  ${plan.from.name} is then removed. Not journalled — putting it back means\n` +
      `  re-adding "${plan.from.name}" (/clubs/${plan.from.slug}) and moving these rows again.`,
  );

  if (APPLY) {
    await mergeClubs(plan);
    console.log(`\nDone. Everything now sits under ${plan.into.name}.`);
    console.log(`Run db:teams:rename next — these names have a different club to lead with.`);
  } else {
    console.log("\nNothing written.");
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
