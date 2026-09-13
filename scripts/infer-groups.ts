import { config } from "dotenv";

// Must run before the db module is loaded — it reads DATABASE_URL at import
// time, and static imports hoist above this call.
config({ path: ".env.local" });

import { asc, eq, ilike } from "drizzle-orm";

/**
 * Put a tournament's games back into their groups, from the schedule's shape.
 *
 *   pnpm db:groups:infer                                  # dry run, every AthleteOne tournament
 *   pnpm db:groups:infer --event=2026-rainier-challenge-boys-weekend
 *   pnpm db:groups:infer --event=… --apply
 *
 * The same reading a paste now does on its own; this is for events that
 * landed before it did, and for looking at what it would do. See
 * group-inference.ts for what it can and cannot read.
 */

const APPLY = process.argv.includes("--apply");
const EVENT = process.argv.find((a) => a.startsWith("--event="))?.slice("--event=".length) ?? null;

async function main() {
  const { db } = await import("../src/db");
  const { events } = await import("../src/db/schema");
  const { inferGroupsForEvent } = await import("../src/features/sync/groups-infer-apply");

  const targets = await db
    .select({ id: events.id, slug: events.slug })
    .from(events)
    .where(EVENT ? eq(events.slug, EVENT) : ilike(events.scheduleUrl, "%athleteone%"))
    .orderBy(asc(events.slug));
  if (targets.length === 0) {
    console.log(EVENT ? `No event called ${EVENT}.` : "No AthleteOne events.");
    return;
  }

  const totals = { grouped: 0, single: 0, showcase: 0, unclear: 0, already: 0, games: 0, entries: 0 };
  const forStandings: string[] = [];

  for (const event of targets) {
    console.log(`\n## ${event.slug}`);
    const out = await inferGroupsForEvent(event.id, { apply: APPLY });
    totals.games += out.gamesLabelled;
    totals.entries += out.entriesLabelled;
    for (const d of out.divisions) {
      totals[d.outcome]++;
      const mark = d.outcome === "unclear" ? "?" : d.outcome === "grouped" ? "✓" : "·";
      console.log(`  ${mark} ${d.division}: ${d.note}`);
      d.groups.forEach((g, i) => console.log(`      ${"ABCDEFGH"[i]}: ${g.join(" · ")}`));
      for (const x of d.extras) console.log(`      ${x}`);
      if (d.outcome === "unclear") forStandings.push(`${event.slug} — ${d.division}: ${d.note}`);
    }
  }

  console.log(
    `\n${totals.grouped} division(s) put into groups, ${totals.single} single tables with a final, ` +
      `${totals.showcase} showcases, ${totals.already} already grouped, ${totals.unclear} unclear.` +
      (APPLY
        ? `\n${totals.games} game(s) and ${totals.entries} entr(ies) labelled.`
        : "\nDry run — --apply writes the clean ones."),
  );
  if (forStandings.length > 0) {
    console.log(
      "\nThe schedule cannot show these divisions' groups. Open each one's standings page on the platform and click the copier — it keeps the heading over each table as the group. A pool where every team plays three of five others may simply be one table there, in which case nothing is wrong here.",
    );
    for (const line of forStandings) console.log(`  - ${line}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
