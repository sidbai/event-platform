import { config } from "dotenv";

// Must run before the db module is loaded — it reads DATABASE_URL at import
// time, and static imports hoist above this call.
config({ path: ".env.local" });

/**
 * File teams under a club by the name they go by.
 *
 *   pnpm db:teams:file --club=sparta-tacoma --like='Sparta Tacoma%'
 *   pnpm db:teams:file --club=sparta-tacoma --like='Sparta Tacoma%' --apply
 *
 * For the answer the admin queue cannot take back. "Not with a club" drops a
 * team out of the queue for good, and a group answered that way before its
 * club existed has no other route home.
 *
 * No alias is saved unless --alias is passed. The matcher already reaches a
 * club whose name the teams carry, and an alias is a decision worth making
 * where it is visible rather than as a side effect of a repair.
 */

const APPLY = process.argv.includes("--apply");
const arg = (name: string) =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=").slice(1).join("=");

async function main() {
  const clubSlug = arg("club");
  const like = arg("like");
  if (!clubSlug || !like) {
    console.log(
      "Usage: pnpm db:teams:file --club=<slug> --like='pattern%' [--alias=<key>] [--apply]",
    );
    process.exit(1);
  }

  const { planFile } = await import("../src/features/clubs/file");
  const { linkTeamsToClub } = await import("../src/features/clubs/link");

  const plan = await planFile(clubSlug, like);
  if ("error" in plan) {
    console.log(plan.error);
    process.exit(1);
  }

  const dry = APPLY ? "" : "  (dry run — pass --apply to write)";
  console.log(`Filing ${plan.teams.length} team(s) under ${plan.club.name}${dry}\n`);

  const byState = new Map<string, number>();
  for (const t of plan.teams) byState.set(t.affiliation, (byState.get(t.affiliation) ?? 0) + 1);
  for (const [state, n] of byState) console.log(`  ${n} currently "${state}"`);
  console.log();
  for (const t of plan.teams.slice(0, 15)) console.log(`      ${t.name}`);
  if (plan.teams.length > 15) console.log(`      and ${plan.teams.length - 15} more`);

  if (plan.teams.length === 0) {
    console.log("\n  nothing matches that is not already filed somewhere.");
    process.exit(0);
  }

  const alias = arg("alias") ?? "";
  console.log(
    alias
      ? `\n  "${alias}" will mean ${plan.club.name} from then on.`
      : `\n  No alias saved. Pass --alias to add one.`,
  );

  if (APPLY) {
    const out = await linkTeamsToClub(
      plan.club.id,
      alias,
      plan.teams.map((t) => t.id),
      null,
    );
    console.log(`\nDone. ${out.linked} team(s) now sit under ${plan.club.name}.`);
    console.log("Run db:teams:rename next — these have a club to lead with now.");
  } else {
    console.log("\nNothing written.");
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
