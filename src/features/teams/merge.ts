import "server-only";

import { and, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  eventOffers,
  eventRegistrations,
  eventTeams,
  matches,
  teamMembers,
  teamAliases,
  teamSlugs,
  teams,
} from "@/db/schema";

import { nameIsDistinctive, normaliseTeamName } from "./merge-plan";

/**
 * Fold several team rows into one.
 *
 * Everything that points at a team has to move, and three of those tables
 * carry a uniqueness rule that a naive move would break: a team may appear
 * once per event, once per division's registrations, and once per event's
 * offers. Two rows of the same real side in the same event is exactly the
 * case where that bites, so the loser's row is dropped rather than moved
 * whenever the survivor already has one.
 *
 * The old slugs are kept. Every fixture on the site links to a team by slug,
 * and a merge without them turns those links into 404s.
 */

export type MergeResult = {
  survivorSlug: string;
  merged: number;
  matchesMoved: number;
  entriesMoved: number;
  entriesDropped: number;
};

export async function mergeTeams(
  survivorId: string,
  loserIds: string[],
  /** Who confirmed it, recorded against the aliases this writes. */
  byUserId: string | null = null,
): Promise<MergeResult> {
  const ids = loserIds.filter((id) => id !== survivorId);
  if (ids.length === 0) throw new Error("nothing to merge");

  const survivor = await db.query.teams.findFirst({
    where: eq(teams.id, survivorId),
    columns: { id: true, slug: true, ownerId: true },
  });
  if (!survivor) throw new Error("survivor is gone");

  const losers = await db.query.teams.findMany({
    where: inArray(teams.id, ids),
    columns: { id: true, slug: true, name: true, ownerId: true },
  });

  /*
   * Never absorb a team somebody owns. The planner already prefers a claimed
   * row as the survivor, but this is the one mistake with no way back — a
   * coach's team folded into a shell cannot be told apart afterwards — so it
   * is checked again here rather than trusted from upstream.
   */
  const owned = losers.filter((l) => l.ownerId !== null);
  if (owned.length > 0) {
    throw new Error(
      `refusing to merge a claimed team away: ${owned.map((o) => o.slug).join(", ")}`,
    );
  }

  const survivorEvents = new Set(
    (
      await db.query.eventTeams.findMany({
        where: eq(eventTeams.teamId, survivorId),
        columns: { eventId: true },
      })
    ).map((e) => e.eventId),
  );

  let matchesMoved = 0;
  let entriesMoved = 0;
  let entriesDropped = 0;

  for (const loser of losers) {
    const home = await db
      .update(matches)
      .set({ homeTeamId: survivorId })
      .where(eq(matches.homeTeamId, loser.id))
      .returning({ id: matches.id });
    const away = await db
      .update(matches)
      .set({ awayTeamId: survivorId })
      .where(eq(matches.awayTeamId, loser.id))
      .returning({ id: matches.id });
    matchesMoved += home.length + away.length;

    const entries = await db.query.eventTeams.findMany({
      where: eq(eventTeams.teamId, loser.id),
      columns: { id: true, eventId: true },
    });
    for (const entry of entries) {
      if (survivorEvents.has(entry.eventId)) {
        // Both rows were in this event. The survivor's entry already carries
        // the division and the standing; a second one cannot exist.
        await db.delete(eventTeams).where(eq(eventTeams.id, entry.id));
        entriesDropped++;
        continue;
      }
      await db
        .update(eventTeams)
        .set({ teamId: survivorId })
        .where(eq(eventTeams.id, entry.id));
      survivorEvents.add(entry.eventId);
      entriesMoved++;
    }

    // The rest move where they can and are dropped where a uniqueness rule
    // says the survivor is already there.
    await db
      .update(eventRegistrations)
      .set({ teamId: survivorId })
      .where(
        and(
          eq(eventRegistrations.teamId, loser.id),
          sql`not exists (select 1 from ${eventRegistrations} r2 where r2.division_id = ${eventRegistrations.divisionId} and r2.team_id = ${survivorId})`,
        ),
      );
    await db.delete(eventRegistrations).where(eq(eventRegistrations.teamId, loser.id));

    await db
      .update(eventOffers)
      .set({ fromTeamId: survivorId })
      .where(
        and(
          eq(eventOffers.fromTeamId, loser.id),
          sql`not exists (select 1 from ${eventOffers} o2 where o2.event_id = ${eventOffers.eventId} and o2.from_team_id = ${survivorId})`,
        ),
      );
    await db.delete(eventOffers).where(eq(eventOffers.fromTeamId, loser.id));

    // Rosters hang off the event_teams entry rather than the team, so they
    // travel with it — and a roster on a dropped duplicate entry belongs to a
    // row the survivor already has a better copy of.
    await db
      .update(teamMembers)
      .set({ teamId: survivorId })
      .where(eq(teamMembers.teamId, loser.id));

    // Keep the address before the row goes.
    await db
      .insert(teamSlugs)
      .values({ slug: loser.slug, teamId: survivorId })
      .onConflictDoUpdate({ target: teamSlugs.slug, set: { teamId: survivorId } });

    /*
     * And the name, so the next import does not ask again.
     *
     * The slug above keeps old links working; this is what makes the merge
     * worth doing twice over. A platform calling a side "Little Warriors B15
     * B" will call it that next season, and the connector binds it to this
     * team instead of minting a row for somebody to merge by hand again.
     *
     * The survivor's own name is deliberately not recorded. It needs no help
     * — a row arriving under it groups by name in the queue already — and an
     * alias binds without asking, which is too much to do with a name two
     * clubs in one region might both use.
     */
    const alias = normaliseTeamName(loser.name);
    if (nameIsDistinctive(alias)) {
      await db
        .insert(teamAliases)
        .values({ alias, teamId: survivorId, createdBy: byUserId ?? null })
        .onConflictDoUpdate({ target: teamAliases.alias, set: { teamId: survivorId } });
    }

    await db.delete(teams).where(eq(teams.id, loser.id));
  }

  /*
   * The survivor takes the cleanest of the addresses.
   *
   * uniqueTeamSlug suffixes each new copy, so the rows are xf-gu13-rcl1,
   * -2, -3, -4 — and the survivor is chosen by how much history it holds,
   * which is unrelated to which suffix it drew. Left alone, a merged team
   * settles on /teams/xf-gu13-rcl1-4 while the bare slug, the one most likely
   * to be linked and indexed, points at it from the sidelines.
   *
   * Every other address still resolves here, so nothing breaks either way.
   */
  /*
   * Only a numbered copy of the survivor's own slug, though.
   *
   * The shortest of all of them was wrong the moment an admin could merge two
   * teams they picked themselves: folding "Warriors BU11 Bravo" into
   * "Warriors BU11 Attack" left a team named Attack living at
   * /teams/warriors-bu11-bravo, because bravo is the shorter string. The URL
   * said one team and the page said another.
   *
   * What this rule is for is the suffix: xf-gu13-rcl1-4 settling back onto
   * xf-gu13-rcl1. So a loser's slug is only adopted when it is the same slug
   * with a number on the end.
   */
  const stem = (slug: string) => slug.replace(/-\d+$/, "");
  const best = [survivor.slug, ...losers.map((l) => l.slug)]
    .filter((slug) => stem(slug) === stem(survivor.slug))
    .sort((a, b) => a.length - b.length || a.localeCompare(b))[0];

  if (best !== survivor.slug) {
    // Free the name before taking it: it is still held by the retired row.
    await db.delete(teamSlugs).where(eq(teamSlugs.slug, best));
    await db.update(teams).set({ slug: best }).where(eq(teams.id, survivorId));
  }

  // Every address this team has ever answered to now resolves to it.
  for (const slug of [survivor.slug, ...losers.map((l) => l.slug)]) {
    await db
      .insert(teamSlugs)
      .values({ slug, teamId: survivorId })
      .onConflictDoUpdate({ target: teamSlugs.slug, set: { teamId: survivorId } });
  }

  return {
    survivorSlug: best,
    merged: losers.length,
    matchesMoved,
    entriesMoved,
    entriesDropped,
  };
}

/** A team by a slug it used to answer to, for redirecting an old link. */
export async function teamBySoleOldSlug(slug: string): Promise<string | null> {
  const row = await db.query.teamSlugs.findFirst({
    where: eq(teamSlugs.slug, slug),
    columns: { teamId: true },
  });
  if (!row) return null;
  const team = await db.query.teams.findFirst({
    where: eq(teams.id, row.teamId),
    columns: { slug: true },
  });
  return team?.slug ?? null;
}
