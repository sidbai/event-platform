import { config } from "dotenv";

// Must run before the db module is loaded — it reads DATABASE_URL at import
// time, and static imports hoist above this call.
config({ path: ".env.local" });

/**
 * Rebuild the team ratings now, rather than waiting for the night.
 *
 *   pnpm predict:rebuild
 *
 * What the nightly cron does, by hand: the first fill after the table is
 * created, or after a batch of scores landed that somebody wants to see
 * forecast today. Replaces the ratings table; touches nothing else.
 */
async function main() {
  const { rebuildRatings } = await import("../src/features/predict/queries");
  const out = await rebuildRatings();
  console.log(`${out.teams} teams rated from ${out.games} decided games.`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
