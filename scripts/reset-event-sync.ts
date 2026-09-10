import { config } from "dotenv";

// Must run before the db module is loaded — it reads DATABASE_URL at import
// time, and static imports hoist above this call.
config({ path: ".env.local" });

/**
 * Throw away what a sync wrote for one event, so it can be written again.
 *
 *   pnpm db:sync:reset --event=<slug>
 *   pnpm db:sync:reset --event=<slug> --apply
 *
 * Then connect or refresh the event and let the connector say it from the
 * start. The work is in features/sync/reset.ts. This is the way in.
 *
 * For a connector that was wrong about something. A re-sync matches on the
 * platform's ids and updates what it finds, which is right and is also why a
 * name written wrong the first time stays wrong: names are only written when
 * a row is created.
 */

const APPLY = process.argv.includes("--apply");
const arg = (name: string) =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=").slice(1).join("=");

async function main() {
  const slug = arg("event");
  if (!slug) {
    console.log("Usage: pnpm db:sync:reset --event=<slug> [--apply]");
    process.exit(1);
  }

  const { planReset, resetEventSync } = await import("../src/features/sync/reset");

  const plan = await planReset(slug);
  if (!plan) {
    console.log(`No event with slug "${slug}".`);
    process.exit(1);
  }

  const dry = APPLY ? "" : "  (dry run — pass --apply to write)";
  console.log(`Resetting ${plan.event.title}${dry}\n`);
  console.log(`  ${plan.matches} fixture(s) deleted`);
  console.log(`  ${plan.entries} entr(ies) deleted, ${plan.divisions} division(s)`);
  console.log(`  ${plan.deleting.length} team(s) deleted — this event is the whole of them`);
  console.log(`  ${plan.keeping.length} team(s) kept`);

  for (const t of plan.keeping) console.log(`    ${t.name}  —  ${t.because}`);

  if (plan.matches === 0 && plan.entries === 0) {
    console.log("\n  Nothing to reset.");
    process.exit(0);
  }

  console.log(
    "\nAfter this the event has no schedule at all until it is synced again.\n" +
      "Check the clubs it needs exist first — a team whose club is not in the\n" +
      "directory keeps its published name, which is the thing being fixed.",
  );

  if (!APPLY) {
    console.log("\nDry run. Pass --apply to write.");
    process.exit(0);
  }

  await resetEventSync(plan);
  console.log(`\nDone. Sync ${plan.event.slug} again.`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
