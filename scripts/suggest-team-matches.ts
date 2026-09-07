import { config } from "dotenv";

config({ path: ".env.local" });

/**
 * Ask a model about teams the rules could not place.
 *
 *   pnpm ai:suggest-merges
 *
 * Run after importing a tournament. It writes suggestions into the admin
 * queue and changes nothing else — accepting one is a person's click.
 *
 * Needs AI_GATEWAY_API_KEY. Without it the run says so and exits, because a
 * missing key is a setup step, not a failure worth a stack trace.
 */
async function main() {
  const { suggestTeamMatches } = await import("../src/features/teams/suggest/run");
  const out = await suggestTeamMatches({ sinceHours: Number(process.env.SINCE_HOURS ?? 48) });
  if (out.skipped) {
    console.log(out.skipped);
  } else {
    console.log(
      `Asked about ${out.asked} team(s); ${out.suggested} suggestion(s) written to /admin/teams.`,
    );
    // Said after the count, so a partial run reads as partial rather than as
    // a failure that lost everything.
    if (out.stoppedEarly) console.log(out.stoppedEarly);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
