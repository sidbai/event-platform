import "server-only";

import { and, asc, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import { eventDivisions, eventRegistrations } from "@/db/schema";

import { opennessOf, type Openness } from "./openness";

export type DivisionWithOpenness = {
  id: string;
  name: string;
  label: string | null;
  birthYears: number[];
  format: string | null;
  rosterMin: number | null;
  rosterMax: number | null;
  feeCents: number | null;
  capacity: number | null;
  registrationOpensAt: Date | null;
  registrationClosesAt: Date | null;
  acceptedCount: number;
  openness: Openness;
};

/**
 * The divisions of an event, each with whether it is taking registrations.
 *
 * Openness is computed here rather than stored, because it is a function of
 * the clock and a count — a stored flag would be wrong the moment a window
 * closed with nobody looking.
 */
export async function divisionsForRegistration(
  eventId: string,
  now: Date,
): Promise<DivisionWithOpenness[]> {
  const rows = await db.query.eventDivisions.findMany({
    where: eq(eventDivisions.eventId, eventId),
    orderBy: [asc(eventDivisions.name)],
  });
  if (rows.length === 0) return [];

  // Only accepted teams take a place. A request that is still pending has not
  // been given one, or a full division would be full of maybes.
  const accepted = await db.query.eventRegistrations.findMany({
    where: and(
      inArray(
        eventRegistrations.divisionId,
        rows.map((d) => d.id),
      ),
      eq(eventRegistrations.status, "accepted"),
    ),
    columns: { divisionId: true },
  });
  const countByDivision = new Map<string, number>();
  for (const a of accepted) {
    countByDivision.set(a.divisionId, (countByDivision.get(a.divisionId) ?? 0) + 1);
  }

  return rows.map((d) => {
    const acceptedCount = countByDivision.get(d.id) ?? 0;
    return {
      id: d.id,
      name: d.name,
      label: d.label,
      birthYears: d.birthYears,
      format: d.format,
      rosterMin: d.rosterMin,
      rosterMax: d.rosterMax,
      feeCents: d.feeCents,
      capacity: d.capacity,
      registrationOpensAt: d.registrationOpensAt,
      registrationClosesAt: d.registrationClosesAt,
      acceptedCount,
      openness: opennessOf(d, acceptedCount, now),
    };
  });
}

/** Every registration for an event, for the organizer to work through. */
export async function registrationsForEvent(eventId: string) {
  const rows = await db.query.eventRegistrations.findMany({
    where: eq(eventRegistrations.eventId, eventId),
    orderBy: [asc(eventRegistrations.createdAt)],
    with: {
      team: { columns: { name: true, slug: true, ageGroup: true } },
      division: { columns: { name: true } },
    },
  });
  return rows;
}

/** What this user's teams have already asked for, so the page can say so. */
export async function myRegistrations(eventId: string, teamIds: string[]) {
  if (teamIds.length === 0) return new Map<string, string>();
  const rows = await db.query.eventRegistrations.findMany({
    where: and(
      eq(eventRegistrations.eventId, eventId),
      inArray(eventRegistrations.teamId, teamIds),
    ),
    columns: { divisionId: true, teamId: true, status: true },
  });
  // Keyed by division+team, since one manager may enter several teams.
  return new Map(rows.map((r) => [`${r.divisionId}:${r.teamId}`, r.status]));
}

/** Teams this user may enter into something. */
export async function myManagedTeams(userId: string) {
  const rows = await db.query.teamMembers.findMany({
    where: (tm, { eq: e, and: a, inArray: ia }) =>
      a(e(tm.userId, userId), ia(tm.role, ["owner", "manager", "coach"])),
    with: { team: { columns: { id: true, name: true, slug: true } } },
  });
  return rows
    .map((r) => r.team)
    .filter((t): t is NonNullable<typeof t> => t !== null);
}
