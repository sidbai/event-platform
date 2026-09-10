import { config } from "dotenv";

// Must run before the db module is loaded — it reads DATABASE_URL at import
// time, and static imports hoist above this call.
config({ path: ".env.local" });

/**
 * Give a team the address its name asks for.
 *
 *   pnpm db:teams:readdress --event=<slug>
 *   pnpm db:teams:readdress --event=<slug> --apply
 *
 * For teams renamed after their row was made: "Harbor Soccer Club B13/14"
 * living at /teams/harbor-sc-7. The old address goes on answering — it is
 * retired the way a merge retires one, and /teams/[slug] redirects.
 *
 * Run db:teams:rename first. This makes an address out of the name a team
 * has, so the name wants to be the right one before it does.
 */

const APPLY = process.argv.includes("--apply");
const arg = (name: string) =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=").slice(1).join("=");

async function main() {
  const slug = arg("event");
  if (!slug) {
    console.log("Usage: pnpm db:teams:readdress --event=<slug> [--apply]");
    process.exit(1);
  }

  const { planReaddress, readdress } = await import("../src/features/teams/readdress");

  const plan = await planReaddress(slug);
  if (!plan) {
    console.log(`No event with slug "${slug}".`);
    process.exit(1);
  }

  const dry = APPLY ? "" : "  (dry run — pass --apply to write)";
  console.log(`Addresses in ${plan.scope}${dry}\n`);

  if (plan.moving.length === 0) {
    console.log("  Every address already comes from its team's name.");
  }
  for (const team of plan.moving) {
    console.log(`  ${team.name}`);
    console.log(`    /teams/${team.from}  ->  /teams/${team.to}`);
  }
  for (const team of plan.keeping) {
    console.log(`  ${team.name}  —  left alone: ${team.because}`);
  }

  if (plan.moving.length === 0) process.exit(0);

  console.log(
    `\n${plan.moving.length} address(es) to change. The old ones keep answering:` +
      ` a link already sent, or already indexed, redirects to the new page.`,
  );

  if (!APPLY) {
    console.log(`\nDry run. Pass --apply to write.`);
    process.exit(0);
  }

  const moved = await readdress(plan);
  console.log(`\nDone. ${moved} team(s) moved.`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
