import { config } from "dotenv";

// Must run before the db module is loaded — it reads DATABASE_URL at import
// time, and static imports hoist above this call.
config({ path: ".env.local" });

/**
 * Take back teams filed under the wrong club.
 *
 *   pnpm db:teams:unfile --club=<slug> --like='%Lake Chelan%'
 *   pnpm db:teams:unfile --club=<slug> --like='%Lake Chelan%' --apply
 *
 * The work is in features/clubs/unfile.ts, where it can be tested against a
 * real database. This is the way in.
 *
 * Written for the fifteen Lake Chelan FC and Lake Hills SC teams that "lake"
 * put under Lake Washington Premier FC before the matcher stopped answering
 * to it. It restores the name each was imported under, which is the half that
 * clearing the affiliation does not fix.
 */

const APPLY = process.argv.includes("--apply");
const arg = (name: string) =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=").slice(1).join("=");

async function main() {
  const clubSlug = arg("club");
  const like = arg("like");
  if (!clubSlug || !like) {
    console.log(
      "Usage: pnpm db:teams:unfile --club=<slug> --like='%pattern%' [--apply]",
    );
    process.exit(1);
  }

  const { planUnfile, unfileTeams } = await import("../src/features/clubs/unfile");

  const plan = await planUnfile(clubSlug, like);
  if (!plan) {
    console.log(`No club with slug "${clubSlug}".`);
    process.exit(1);
  }

  const dry = APPLY ? "" : "  (dry run — pass --apply to write)";
  console.log(
    `Taking ${plan.teams.length} team(s) back from ${plan.club.name}${dry}\n`,
  );

  /*
   * Two teams keep their name for opposite reasons, and only one is a
   * problem. A team already called what it was imported as needs nothing;
   * a team with no imported name recorded is the one nobody can put right
   * without looking it up. The first version said both the same way and
   * then listed all of them as work to do.
   */
  const unnamed = plan.teams.filter((t) => !t.restored && !t.imported);
  const settled = plan.teams.filter((t) => !t.restored && t.imported);
  for (const team of plan.teams) {
    console.log(`  ${team.name}`);
    console.log(
      team.restored
        ? `    → ${team.restored}`
        : team.imported
          ? `    → name kept: already what it was imported as`
          : `    → name kept: nothing recorded what it was imported as`,
    );
  }

  if (plan.teams.length === 0) {
    console.log("  nothing matches that pattern under that club.");
    process.exit(0);
  }

  if (settled.length > 0) {
    console.log(
      `\n${settled.length} already carry their own name — the rename never ` +
        `reached them, and there is nothing to do about those.`,
    );
  }

  if (unnamed.length > 0) {
    console.log(
      `\n${unnamed.length} may still carry ${plan.club.name}'s name and ` +
        `nothing recorded what they were called. ` +
        `The slug was made before the rename, so it still carries what the ` +
        `team was called — rename each by hand from it:`,
    );
    for (const t of unnamed) console.log(`    ${t.slug}\n      /teams/${t.slug}/settings`);
  }

  if (APPLY) {
    const n = await unfileTeams(plan);
    console.log(`\nDone. ${n} team(s) are unplaced and back in the queue.`);
  } else {
    console.log(`\nNothing written.`);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
