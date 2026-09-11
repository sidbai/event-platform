import { readFileSync } from "node:fs";

import { config } from "dotenv";

// Must run before the db module is loaded — it reads DATABASE_URL at import
// time, and static imports hoist above this call.
config({ path: ".env.local" });

/**
 * Import a schedule from a file, without a browser in the loop.
 *
 *   pnpm db:import:schedule --event=<slug> --file=<bundle.json|schedule.tsv>
 *   pnpm db:import:schedule --event=<slug> --file=… --apply
 *
 * The weekly step. Collecting the fixtures still needs a person — the
 * platform answers us 403 and its robots.txt refuses crawlers, so what
 * arrives is a file a browser wrote — but nothing after that does, and doing
 * it by hand meant opening a page, choosing an event, and pasting a hundred
 * kilobytes into a textarea, twice.
 *
 * Same path as the paste box: applyPastedText, which is the import with no
 * form and no session around it. The date guard, the team binder and the
 * idempotent write all apply exactly as they do there, which is the point of
 * going through it rather than around it.
 *
 * A bundle holding several leagues is filtered with --league, matched loosely
 * so "rl boys" finds "ECNL RL Boys". Without it, everything in the file goes
 * to the one event named — which is right for a bundle of one league's age
 * groups and wrong for a bundle of six.
 */

const APPLY = process.argv.includes("--apply");
const CONFIRM_DATES = process.argv.includes("--confirm-dates");
const arg = (name: string) =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=").slice(1).join("=");

async function main() {
  const slug = arg("event");
  const file = arg("file");
  if (!slug || !file) {
    console.log(
      "Usage: pnpm db:import:schedule --event=<slug> --file=<bundle.json|schedule.tsv>\n" +
        "                              [--league=<substring>] [--confirm-dates] [--apply]",
    );
    process.exit(1);
  }

  const { db } = await import("../src/db");
  const { events } = await import("../src/db/schema");
  const { eq } = await import("drizzle-orm");
  const { htmlIn } = await import("../src/features/sync/har");
  const { fragmentsToTsv, readFragment } = await import("../src/features/sync/fragments");
  const { logosIn } = await import("../src/features/sync/bundle-logos");
  const { applyBundleLogos } = await import("../src/features/sync/team-logos");
  const { applyPastedText } = await import("../src/features/sync/import-text");

  const event = await db.query.events.findFirst({
    where: eq(events.slug, slug),
    columns: { id: true, slug: true, title: true, startsAt: true, endsAt: true },
  });
  if (!event) {
    console.log(`No event with slug "${slug}".`);
    process.exit(1);
  }

  const raw = readFileSync(file, "utf8");
  let tsv: string;
  let source: string;
  // The badges the bookmark collected for the leagues being imported.
  const logos = new Map<string, string>();

  if (raw.trimStart().startsWith("{") || raw.trimStart().startsWith("[")) {
    const wanted = arg("league")?.toLowerCase();
    /*
     * The league is the first segment, and the match runs from the start of
     * it. Anywhere-in-the-label was the obvious version and it is wrong in the
     * one way that matters: "pre-ecnl boys" contains "ecnl boys", so asking
     * for ECNL Boys quietly took Pre-ECNL's 288 fixtures along with it and
     * would have written them into the wrong league's event.
     */
    const found = htmlIn(JSON.parse(raw)).filter(
      (f) => !wanted || f.label.split(".")[0].toLowerCase().startsWith(wanted),
    );
    if (found.length === 0) {
      console.log(
        wanted
          ? `Nothing in that file is labelled like "${wanted}".`
          : "No schedule markup in that file.",
      );
      process.exit(1);
    }
    for (const f of found) {
      console.log(`  ${f.label}  ${readFragment(f.html).length} fixture(s)`);
    }
    const leagues = new Set(found.map((f) => f.label.split(".")[0]));
    for (const [league, byName] of logosIn(JSON.parse(raw))) {
      if (leagues.has(league)) for (const [name, url] of byName) logos.set(name, url);
    }
    if (logos.size > 0) console.log(`  ${logos.size} team badge(s) in the bundle`);
    tsv = fragmentsToTsv(found.map((f) => f.html));
    source = `${found.length} fragment(s)`;
  } else {
    tsv = raw;
    source = "the file as pasted";
  }

  const fixtures = tsv.split("\n").length - 1;
  console.log(`\n${fixtures} fixture(s) from ${source} → ${event.title}`);

  if (!APPLY) {
    console.log("\nDry run. Pass --apply to write.");
    process.exit(0);
  }

  /*
   * Division is left empty on purpose: every row of an AthleteOne export
   * carries its own ("BU13 - ECNL Regional League"), and a fallback here
   * would only be used by a row that has none, which is a row worth noticing
   * rather than filing under a guess.
   */
  const out = await applyPastedText(event, { text: tsv, confirmed: CONFIRM_DATES });
  if (out.error) {
    console.log(`\n${out.error}`);
    /*
     * The date guard refuses a paste whose dates fall outside the event's own,
     * and it is right far more often than it is wrong — 421 Labor Day fixtures
     * once landed in a June tournament. Say how to override rather than
     * leaving somebody to find the flag.
     */
    if (/date/i.test(out.error)) {
      console.log("Pass --confirm-dates if the event's own dates are the ones that are wrong.");
    }
    process.exit(1);
  }
  console.log(`\n${out.detail ?? "Done."}`);

  /*
   * After the fixtures, so the entries exist to match the badges against.
   * Only teams with no crest take one; the owner's uploads stay.
   */
  if (logos.size > 0) {
    const badges = await applyBundleLogos(event.id, logos);
    console.log(
      `Badges: ${badges.set} set, ${badges.kept} already had a crest, ${badges.unmatched} not in this event, ${badges.refused} not usable.`,
    );
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
