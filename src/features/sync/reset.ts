import "server-only";

import { eq, inArray, isNotNull, or, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  eventDivisions,
  eventTeams,
  events,
  matches,
  teamMerges,
  teams,
} from "@/db/schema";

/**
 * Throwing away what a sync wrote, so it can be written again.
 *
 * A connector that was wrong about something writes rows that carry the
 * mistake, and fixing the connector does not go back and fix them: a re-sync
 * matches on the platform's own ids and updates what it finds, which is the
 * right behaviour and the reason the old rows survive their own correction.
 * Modular11 arrived without a gender, so ninety-five teams were named for
 * their club alone and given slugs to match — harbor-sc-7 — and no amount of
 * re-syncing changes a name that is only written when a row is created.
 *
 * So: delete, and let the connector say it again from the start.
 *
 * What is deleted is deliberately narrow. A team that plays in another event,
 * that somebody has claimed, that has a roster or members or a registration,
 * is not this sync's to throw away — the entry in this event goes and the
 * team stays. Everything kept is reported, because a reset that quietly
 * leaves half the rows behind is worse than one that refuses.
 */

export type ResetPlan = {
  event: { id: string; slug: string; title: string };
  matches: number;
  divisions: number;
  entries: number;
  /** Teams this event is the whole of, which go with it. */
  deleting: { id: string; name: string; slug: string }[];
  /** Teams that outlive it, and the reason each does. */
  keeping: { name: string; slug: string; because: string }[];
};

export async function planReset(slug: string): Promise<ResetPlan | null> {
  const event = await db.query.events.findFirst({
    where: eq(events.slug, slug),
    columns: { id: true, slug: true, title: true },
  });
  if (!event) return null;

  const rows = await db
    .select({
      id: teams.id,
      name: teams.name,
      slug: teams.slug,
      claimed: isNotNull(teams.ownerId),
      /*
       * Each of these is a reason the row is somebody's rather than the
       * connector's. Counted in one pass because the alternative is five
       * queries per team and this runs over a whole league.
       */
      elsewhere: sql<number>`(
        select count(*) from ${eventTeams} other
        where other.team_id = ${teams.id} and other.event_id <> ${event.id}
      )`.mapWith(Number),
      people: sql<number>`(
        select
          (select count(*) from team_members where team_id = ${teams.id})
        + (select count(*) from event_registrations where team_id = ${teams.id})
        + (select count(*) from rosters r
             join event_teams et on et.id = r.event_team_id
            where et.team_id = ${teams.id})
      )`.mapWith(Number),
    })
    .from(teams)
    .innerJoin(eventTeams, eq(eventTeams.teamId, teams.id))
    .where(eq(eventTeams.eventId, event.id))
    .groupBy(teams.id);

  const deleting: ResetPlan["deleting"] = [];
  const keeping: ResetPlan["keeping"] = [];
  for (const row of rows) {
    const because = row.claimed
      ? "claimed by somebody"
      : row.elsewhere > 0
        ? `plays in ${row.elsewhere} other event(s)`
        : row.people > 0
          ? "has a roster, members or a registration"
          : null;
    if (because) keeping.push({ name: row.name, slug: row.slug, because });
    else deleting.push({ id: row.id, name: row.name, slug: row.slug });
  }

  const [{ count: matchCount }] = await db
    .select({ count: sql<number>`count(*)`.mapWith(Number) })
    .from(matches)
    .where(eq(matches.eventId, event.id));
  const [{ count: divisionCount }] = await db
    .select({ count: sql<number>`count(*)`.mapWith(Number) })
    .from(eventDivisions)
    .where(eq(eventDivisions.eventId, event.id));

  return {
    event,
    matches: matchCount,
    divisions: divisionCount,
    entries: rows.length,
    deleting,
    keeping,
  };
}

/**
 * In one transaction, because a half-done reset is the worst of the three
 * states: the fixtures gone and the teams still standing reads, from every
 * page that shows them, as a league that quietly stopped existing.
 *
 * Order is forced by the foreign keys — matches and entries point at teams
 * without cascading, so they come off first.
 */
export async function resetEventSync(plan: ResetPlan): Promise<void> {
  const ids = plan.deleting.map((t) => t.id);

  await db.transaction(async (tx) => {
    await tx.delete(matches).where(eq(matches.eventId, plan.event.id));
    await tx.delete(eventTeams).where(eq(eventTeams.eventId, plan.event.id));
    await tx.delete(eventDivisions).where(eq(eventDivisions.eventId, plan.event.id));

    if (ids.length > 0) {
      /*
       * The merge journal outlives the rows it describes, and an entry whose
       * team no longer exists is an undo button that cannot work. Dropped
       * rather than left to be discovered by somebody pressing it.
       */
      await tx
        .delete(teamMerges)
        .where(
          or(
            inArray(teamMerges.survivorId, ids),
            inArray(sql`${teamMerges.team}->>'id'`, ids),
          ),
        );
      await tx.delete(teams).where(inArray(teams.id, ids));
    }
  });
}
