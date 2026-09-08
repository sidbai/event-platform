import { spawnSync } from "node:child_process";

/**
 * Fill in everything a team's name says, for every team.
 *
 *   pnpm db:backfill:teams            # says what each pass would do
 *   pnpm db:backfill:teams --apply
 *
 * The three passes in the order they depend on each other, because they do:
 * a team's club decides whether a branch like "Shoreline" reads as its
 * programme, and its birth years and gender are what the duplicate finder
 * matches on afterwards.
 *
 * Teams created by an import already arrive with all of this. What needs a
 * pass is everything imported before that shipped — and it kept being three
 * commands nobody remembered, which is how 542 teams came to have no club
 * and 375 no gender while the scripts to fix them sat in the repo.
 *
 * Run as commands rather than imported: each pass is a CLI that ends by
 * exiting, and importing them in turn would stop after the first.
 *
 * Safe to re-run. Every pass writes only where a value is missing.
 */

const PASSES = [
  ["db:backfill:clubs", "file teams under the club their name names"],
  ["db:backfill:age", "birth years and gender"],
  ["db:backfill:naming", "tier and the club's own programme"],
] as const;

const args = process.argv.slice(2);

console.log(
  args.includes("--apply")
    ? "Filling in what team names say.\n"
    : "Filling in what team names say  (dry run — pass --apply to write)\n",
);

for (const [script, what] of PASSES) {
  console.log(`── ${script.split(":").pop()}: ${what}`);
  const out = spawnSync("pnpm", ["-s", script, ...args], {
    stdio: "inherit",
    env: process.env,
  });
  if (out.status !== 0) {
    console.error(`\n${script} failed; stopping before the passes that depend on it.`);
    process.exit(out.status ?? 1);
  }
  console.log("");
}
