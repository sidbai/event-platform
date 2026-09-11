import { config } from "dotenv";

// Must run before the db module is loaded — it reads DATABASE_URL at import
// time, and static imports hoist above this call.
config({ path: ".env.local" });

/**
 * Give every crestless team its club's crest.
 *
 *   pnpm db:backfill:crests
 *   pnpm db:backfill:crests --apply
 *
 * The fallback at render is still there for anything that slips through; this
 * is so a call site that forgets it still draws the right badge. Changing a
 * club's logo carries to its teams from then on, so this is not a thing to
 * remember to run again.
 */

const APPLY = process.argv.includes("--apply");

async function main() {
  const { planCrests, backfillCrests } = await import(
    "../src/features/teams/borrowed-crest"
  );

  const plan = await planCrests();
  const total = plan.reduce((n, row) => n + row.teams, 0);
  const dry = APPLY ? "" : "  (dry run — pass --apply to write)";
  console.log(`${total} team(s) would take their club's crest${dry}\n`);

  for (const row of plan.slice(0, 20)) {
    console.log(`  ${String(row.teams).padStart(4)}  ${row.club}`);
  }
  if (plan.length > 20) console.log(`  …and ${plan.length - 20} more clubs`);

  if (total === 0) {
    console.log("\n  Every team already wears one.");
    process.exit(0);
  }

  if (!APPLY) {
    console.log(`\nDry run. Pass --apply to write.`);
    process.exit(0);
  }

  const written = await backfillCrests();
  console.log(`\nDone. ${written} team(s).`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
