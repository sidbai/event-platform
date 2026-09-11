import { config } from "dotenv";

config({ path: ".env.local" });

import { readFile } from "node:fs/promises";

/**
 * Put a file of merge recommendations in front of the admin.
 *
 *   pnpm db:teams:suggest                 dry run: resolves every name, writes nothing
 *   pnpm db:teams:suggest --apply         queues them on /admin/teams
 *   pnpm db:teams:suggest --file=path.json
 *
 * The file is data/team-merge-suggestions.json unless told otherwise: pairs
 * of team names with a confidence and a one-line reason, written by whoever
 * read the standing proposals against the club knowledge base. Each one
 * lands in the same queue a model's suggestions do, with its reason beside
 * it, and accepting one is still a person's click. Nothing here merges.
 *
 * Every name has to resolve to exactly one team, and both to the same club;
 * anything else is reported and skipped, because a suggestion that names
 * the wrong row is worse than none.
 */

type Suggestion = { a: string; b: string; confidence: "high" | "medium"; why: string };

function flag(name: string): string | undefined {
  return process.argv.find((x) => x.startsWith(`--${name}=`))?.split("=").slice(1).join("=");
}

async function main() {
  const { db } = await import("../src/db");
  const { teams, teamMatchSuggestions } = await import("../src/db/schema");
  const { inArray } = await import("drizzle-orm");
  const { mergeDirection } = await import("../src/features/teams/suggest/review-prompt");
  const { dismissedPairs, pairKey } = await import("../src/features/teams/non-duplicates");

  const apply = process.argv.includes("--apply");
  const file = flag("file") ?? "data/team-merge-suggestions.json";
  const doc = JSON.parse(await readFile(file, "utf8")) as {
    readAt: string;
    suggestions: Suggestion[];
  };

  const names = [...new Set(doc.suggestions.flatMap((s) => [s.a, s.b]))];
  const rows = await db
    .select({ id: teams.id, name: teams.name, clubId: teams.clubId })
    .from(teams)
    .where(inArray(teams.name, names));
  const byName = new Map<string, typeof rows>();
  for (const r of rows) byName.set(r.name, [...(byName.get(r.name) ?? []), r]);

  /*
   * How much history each side holds decides which way a merge would run.
   *
   * Two aggregate queries with inArray rather than one raw `= any(...)`:
   * binding an array into raw SQL has failed in this repository three times,
   * and each time it failed by returning nothing rather than by erroring.
   */
  const { matches, eventTeams } = await import("../src/db/schema");
  const { or, sql } = await import("drizzle-orm");
  const ids = rows.map((r) => r.id);
  const games = ids.length
    ? await db
        .select({
          home: matches.homeTeamId,
          away: matches.awayTeamId,
        })
        .from(matches)
        .where(or(inArray(matches.homeTeamId, ids), inArray(matches.awayTeamId, ids)))
    : [];
  const eventsOf = ids.length
    ? await db
        .select({ teamId: eventTeams.teamId, n: sql<number>`count(distinct ${eventTeams.eventId})::int` })
        .from(eventTeams)
        .where(inArray(eventTeams.teamId, ids))
        .groupBy(eventTeams.teamId)
    : [];
  const held = new Map<string, { games: number; events: number }>();
  const bump = (id: string | null, key: "games" | "events", by = 1) => {
    if (!id) return;
    const h = held.get(id) ?? { games: 0, events: 0 };
    h[key] += by;
    held.set(id, h);
  };
  for (const g of games) {
    bump(g.home, "games");
    bump(g.away, "games");
  }
  for (const e of eventsOf) bump(e.teamId, "events", e.n);

  const ruledOut = await dismissedPairs();

  let ok = 0;
  let skipped = 0;
  let written = 0;
  for (const s of doc.suggestions) {
    const [a, b] = [byName.get(s.a) ?? [], byName.get(s.b) ?? []];
    const problem =
      a.length === 0 ? `no team named "${s.a}"`
      : b.length === 0 ? `no team named "${s.b}"`
      : a.length > 1 ? `"${s.a}" names ${a.length} teams`
      : b.length > 1 ? `"${s.b}" names ${b.length} teams`
      : a[0].id === b[0].id ? "the same row twice"
      : a[0].clubId !== b[0].clubId ? "different clubs"
      : null;
    if (problem) {
      console.log(`  skip  ${s.a}  ||  ${s.b}\n        ${problem}`);
      skipped++;
      continue;
    }
    const [x, y] = pairKey(a[0].id, b[0].id);
    if (ruledOut.has(`${x}:${y}`)) {
      console.log(`  skip  ${s.a}  ||  ${s.b}\n        somebody already said these are two teams`);
      skipped++;
      continue;
    }
    const side = (t: { id: string; name: string }) => ({
      ...t,
      matches: held.get(t.id)?.games ?? 0,
      events: held.get(t.id)?.events ?? 0,
    });
    const { thin, thick } = mergeDirection(side(a[0]), side(b[0]));
    ok++;
    console.log(`  ${s.confidence.padEnd(6)} ${thin.name}  →  ${thick.name}\n         ${s.why}`);

    if (!apply) continue;
    await db
      .insert(teamMatchSuggestions)
      .values({
        newTeamId: thin.id,
        existingTeamId: thick.id,
        confidence: s.confidence,
        why: s.why.slice(0, 200),
        model: `read by hand against the club knowledge base, ${doc.readAt}`,
      })
      .onConflictDoNothing();
    written++;
  }

  console.log(
    `\n${ok} resolved, ${skipped} skipped. ` +
      (apply ? `${written} queued on /admin/teams.` : "Dry run — nothing written. Add --apply to queue them."),
  );
  process.exit(skipped > 0 && !apply ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
