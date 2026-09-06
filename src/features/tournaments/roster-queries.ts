import "server-only";

import { and, asc, eq, inArray, or } from "drizzle-orm";

import { db } from "@/db";
import { eventTeams, rosters, teamMembers, teams } from "@/db/schema";

/**
 * Every team the user manages in this event.
 *
 * Was one row, matched on teams.ownerId, and returned rows[0]. Two things
 * were wrong with that. A club entering two age groups in the same Cup could
 * only ever reach one of their rosters — the other simply had no route to it,
 * and its check-in sheet stayed empty. And ownership is the wrong test: the
 * people who may enter a team are its owner, managers and coaches, so a coach
 * who put the team in could not then fill in who was playing.
 *
 * Matched the same way canScheduleForTeam matches, including its fallback to
 * teams.ownerId for teams claimed before team_members existed.
 */
export async function managedEntries(eventId: string, userId: string) {
  const rows = await db
    .select({
      eventTeamId: eventTeams.id,
      teamId: teams.id,
      teamName: teams.name,
      divisionId: eventTeams.divisionId,
      ownerId: teams.ownerId,
    })
    .from(eventTeams)
    .innerJoin(teams, eq(teams.id, eventTeams.teamId))
    .leftJoin(
      teamMembers,
      and(eq(teamMembers.teamId, teams.id), eq(teamMembers.userId, userId)),
    )
    .where(
      and(
        eq(eventTeams.eventId, eventId),
        or(
          eq(teams.ownerId, userId),
          inArray(teamMembers.role, ["owner", "manager", "coach"]),
        ),
      ),
    )
    .orderBy(asc(teams.name));

  // The join can produce a row per matching membership; one entry per team.
  const seen = new Set<string>();
  return rows.filter((r) => !seen.has(r.eventTeamId) && seen.add(r.eventTeamId));
}

export async function rosterFor(eventTeamId: string) {
  return db.query.rosters.findMany({
    where: eq(rosters.eventTeamId, eventTeamId),
    orderBy: [asc(rosters.playerName)],
  });
}

/**
 * Every submitted roster in an event, keyed by event_teams row.
 *
 * Teams have always been able to submit these; nothing has ever read them
 * back except the team itself. So an organizer told by their own checklist to
 * do "roster verification" at check-in had the players in the database and no
 * way to see them.
 */
export async function rostersForEvent(eventId: string) {
  const rows = await db
    .select({
      eventTeamId: rosters.eventTeamId,
      playerName: rosters.playerName,
      birthYear: rosters.birthYear,
    })
    .from(rosters)
    .innerJoin(eventTeams, eq(eventTeams.id, rosters.eventTeamId))
    .where(eq(eventTeams.eventId, eventId))
    .orderBy(asc(rosters.playerName));

  const byTeam = new Map<string, { playerName: string; birthYear: number | null }[]>();
  for (const r of rows) {
    byTeam.set(r.eventTeamId, [
      ...(byTeam.get(r.eventTeamId) ?? []),
      { playerName: r.playerName, birthYear: r.birthYear },
    ]);
  }
  return byTeam;
}
