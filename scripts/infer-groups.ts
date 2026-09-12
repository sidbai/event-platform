import { config } from "dotenv";

// Must run before the db module is loaded — it reads DATABASE_URL at import
// time, and static imports hoist above this call.
config({ path: ".env.local" });

import { and, asc, eq, inArray, isNull } from "drizzle-orm";

/**
 * Put a tournament's games back into their groups, from the schedule's shape.
 *
 *   pnpm db:groups:infer                                  # dry run, every AthleteOne tournament
 *   pnpm db:groups:infer --event=2026-rainier-challenge-boys-weekend
 *   pnpm db:groups:infer --event=… --apply
 *
 * See group-inference.ts for what it can and cannot read. The dry run prints
 * each division with the groups it found, or the reason it found none. Apply
 * writes group labels onto the games and the entries of the divisions it
 * read cleanly, and only where nothing is labelled yet; divisions it could
 * not read are listed for the standings page to be copied instead.
 */

const APPLY = process.argv.includes("--apply");
const EVENT = process.argv.find((a) => a.startsWith("--event="))?.slice("--event=".length) ?? null;

async function main() {
  const { db } = await import("../src/db");
  const { eventDivisions, eventTeams, events, matches, teams } = await import("../src/db/schema");
  const { inferGroups } = await import("../src/features/sync/group-inference");
  const { ilike } = await import("drizzle-orm");

  const targets = await db
    .select({ id: events.id, slug: events.slug })
    .from(events)
    .where(EVENT ? eq(events.slug, EVENT) : ilike(events.scheduleUrl, "%athleteone%"))
    .orderBy(asc(events.slug));
  if (targets.length === 0) {
    console.log(EVENT ? `No event called ${EVENT}.` : "No AthleteOne events.");
    return;
  }

  let clean = 0;
  let unclear = 0;
  let already = 0;
  let gamesLabelled = 0;
  let entriesLabelled = 0;
  const forStandings: string[] = [];

  for (const event of targets) {
    console.log(`\n## ${event.slug}`);
    const divisions = await db
      .select({ id: eventDivisions.id, name: eventDivisions.name })
      .from(eventDivisions)
      .where(eq(eventDivisions.eventId, event.id))
      .orderBy(asc(eventDivisions.name));
    const names = new Map(
      (await db.select({ id: teams.id, name: teams.name }).from(teams)).map((t) => [t.id, t.name]),
    );

    for (const division of divisions) {
      const games = await db
        .select({
          id: matches.id,
          home: matches.homeTeamId,
          away: matches.awayTeamId,
          homePh: matches.homePlaceholder,
          awayPh: matches.awayPlaceholder,
          at: matches.kickoffAt,
          groupLabel: matches.groupLabel,
        })
        .from(matches)
        .where(eq(matches.divisionId, division.id))
        .orderBy(asc(matches.kickoffAt));
      if (games.length === 0) continue;
      if (games.some((g) => g.groupLabel)) {
        already++;
        console.log(`  ${division.name}: already grouped — left alone`);
        continue;
      }
      const fixtures = games.map((g) => ({
        id: g.id,
        home: g.home ?? `ph:${g.homePh ?? "?"}`,
        away: g.away ?? `ph:${g.awayPh ?? "?"}`,
        at: g.at ? g.at.getTime() : null,
      }));
      const out = inferGroups(fixtures);
      const label = (key: string) => (key.startsWith("ph:") ? key.slice(3) : (names.get(key) ?? key));
      if (!out.ok) {
        unclear++;
        forStandings.push(`${event.slug} — ${division.name}: ${out.reason}`);
        console.log(`  ${division.name}: ? ${out.reason}`);
        continue;
      }
      if (out.groups.length === 1 && out.labels.size === 0) {
        console.log(`  ${division.name}: one round robin, nothing to label`);
        continue;
      }
      clean++;
      console.log(`  ${division.name}: ${out.note}`);
      out.groups.forEach((g, i) => {
        if (out.groups.length > 1) console.log(`      ${"ABCDEFGH"[i]}: ${g.map(label).join(" · ")}`);
      });
      for (const [id, l] of out.labels) {
        if (l === "Final" || l === "Placement") {
          const g = fixtures.find((f) => f.id === id)!;
          console.log(`      ${l}: ${label(g.home)} v ${label(g.away)}`);
        }
      }
      if (!APPLY) continue;

      for (const [id, l] of out.labels) {
        await db.update(matches).set({ groupLabel: l }).where(and(eq(matches.id, id), isNull(matches.groupLabel)));
        gamesLabelled++;
      }
      if (out.groups.length > 1) {
        for (const [i, g] of out.groups.entries()) {
          const ids = g.filter((k) => !k.startsWith("ph:"));
          if (ids.length === 0) continue;
          const done = await db
            .update(eventTeams)
            .set({ groupLabel: "ABCDEFGH"[i] })
            .where(
              and(
                eq(eventTeams.eventId, event.id),
                eq(eventTeams.divisionId, division.id),
                inArray(eventTeams.teamId, ids),
                isNull(eventTeams.groupLabel),
              ),
            )
            .returning({ id: eventTeams.id });
          entriesLabelled += done.length;
        }
      }
    }
  }

  console.log(
    `\n${clean} division(s) read cleanly, ${unclear} need the standings page, ${already} already grouped.` +
      (APPLY ? `\n${gamesLabelled} game(s) and ${entriesLabelled} entr(ies) labelled.` : "\nDry run — --apply writes the clean ones."),
  );
  if (forStandings.length > 0) {
    console.log("\nCopy the standings page for these (the copier keeps the group heading now):");
    for (const line of forStandings) console.log(`  - ${line}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
