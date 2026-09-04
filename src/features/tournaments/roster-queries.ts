import "server-only";

import { and, asc, eq } from "drizzle-orm";

import { db } from "@/db";
import { eventTeams, rosters, teams } from "@/db/schema";

/** The event_teams row for a team the given user manages in this event. */
export async function managedEntry(eventId: string, userId: string) {
  const rows = await db
    .select({
      eventTeamId: eventTeams.id,
      teamId: teams.id,
      teamName: teams.name,
      divisionId: eventTeams.divisionId,
    })
    .from(eventTeams)
    .innerJoin(teams, eq(teams.id, eventTeams.teamId))
    .where(and(eq(eventTeams.eventId, eventId), eq(teams.claimedBy, userId)));
  return rows[0] ?? null;
}

export async function rosterFor(eventTeamId: string) {
  return db.query.rosters.findMany({
    where: eq(rosters.eventTeamId, eventTeamId),
    orderBy: [asc(rosters.playerName)],
  });
}
