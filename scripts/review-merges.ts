import { config } from "dotenv";

config({ path: ".env.local" });

/**
 * Ask a model about every pair the rules could not decide.
 *
 *   pnpm ai:review-merges --dry-run
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

  const dryRun = process.argv.includes("--dry-run");
  const out = await reviewProposals({ limit, dryRun });
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
      dryRun
        ? `${out.proposed.length} would be recommended. Nothing was written.`
        : `${out.written} new recommendation(s) in /admin/teams.`,
    ].join("\n"),
  );

  /*
   * The recommendations in full, because a count is not something anybody can
   * check. Printed on a real run too: the queue shows the same rows, but the
   * first pass of a model over a whole backlog is worth reading in one place.
   */
  if (dryRun && out.verdicts.length) {
    /*
     * The refusals too, and they are the half worth reading. A run reporting
     * "40 of 41 are two teams" that shows only the one it agreed with cannot
     * be judged — a model answering "different" to everything scores the same.
     */
    console.log("");
    for (const v of out.verdicts) {
      const mark = v.verdict === "same" ? "==" : v.verdict === "different" ? "!=" : "??";
      console.log(`  ${mark}  ${v.a}\n      ${v.b}\n      ${v.why}`);
    }
  } else if (out.proposed.length) {
    console.log("");
    for (const p of out.proposed) {
      console.log(`  ${p.a}\n    is  ${p.b}\n    ${p.why}`);
    }
  }
  // Said after the counts, so a partial run reads as partial rather than as a
  // failure that lost everything.
  if (out.stoppedEarly) console.log(out.stoppedEarly);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
