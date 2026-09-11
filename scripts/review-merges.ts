import { config } from "dotenv";

config({ path: ".env.local" });

/**
 * Ask a model about every pair the rules could not decide.
 *
 *   pnpm ai:review-merges
 *   pnpm ai:review-merges --limit=60
 *
 * The same work the nightly cron does, runnable by hand — which is how you
 * check what a change to the knowledge base did to the answers before it goes
 * anywhere near a schedule.
 *
 * Writes recommendations into the admin queue and nothing else. Accepting one
 * is still somebody's click.
 */
async function main() {
  const { reviewProposals } = await import("../src/features/teams/suggest/review");

  const limit = Number(
    process.argv.find((a) => a.startsWith("--limit="))?.split("=")[1] ?? 400,
  );

  const out = await reviewProposals({ limit });
  if (out.skipped) {
    console.log(out.skipped);
    process.exit(0);
  }

  console.log(
    [
      `Reviewed ${out.reviewed} pair(s):`,
      `  one team        ${String(out.same).padStart(4)}`,
      `  two teams       ${String(out.different).padStart(4)}`,
      `  cannot tell     ${String(out.unsure).padStart(4)}`,
      "",
      `${out.written} new recommendation(s) in /admin/teams.`,
    ].join("\n"),
  );
  // Said after the counts, so a partial run reads as partial rather than as a
  // failure that lost everything.
  if (out.stoppedEarly) console.log(out.stoppedEarly);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
