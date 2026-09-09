import "server-only";

import { eq } from "drizzle-orm";

import { db } from "@/db";
import { events } from "@/db/schema";
import { getCurrentUser } from "@/features/auth";
import { isAdmin } from "@/features/auth/admin";
import { canScheduleForTeam } from "@/features/teams/access";

/**
 * True if the current user may manage this event — its organizer, an admin, or
 * staff (owner/manager/coach) of the team hosting it.
 */
export async function canManageEvent(
  ref:
    | { id: string }
    | { slug: string }
    | { organizerId: string | null; hostTeamId?: string | null },
): Promise<boolean> {
  const user = await getCurrentUser();
  if (!user) return false;
  if (isAdmin(user)) return true;

  let organizerId: string | null | undefined;
  let hostTeamId: string | null | undefined;

  if ("organizerId" in ref) {
    ({ organizerId, hostTeamId } = ref);
  } else {
    const row = await db.query.events.findFirst({
      where: "id" in ref ? eq(events.id, ref.id) : eq(events.slug, ref.slug),
      columns: { organizerId: true, hostTeamId: true },
    });
    organizerId = row?.organizerId;
    hostTeamId = row?.hostTeamId;
  }

  if (organizerId && organizerId === user.id) return true;
  if (hostTeamId) return canScheduleForTeam(hostTeamId);
  return false;
}

/**
 * True if the current user may bring a schedule into this event.
 *
 * Deliberately wider than canManageEvent, and only for this one thing.
 *
 * A listing has no organizer — nobody here runs somebody else's tournament,
 * which is why organizerId is null on one — so managing it is an admin's job.
 * But the person who listed it is the person who went and collected
 * twenty-seven flights of fixtures, and making them wait for an admin to
 * paste what they already hold is how the schedule never arrives.
 *
 * It was also inconsistent: the create form imports whatever files came with
 * it, so the same person could import at the moment of listing and not five
 * minutes later.
 *
 * What it grants is narrow. Fixtures, divisions and the teams they name, into
 * one event. Not the event's own details, not taking it down, not entries —
 * those stay with canManageEvent.
 */
export async function canImportSchedule(
  ref: { id: string } | { slug: string },
): Promise<boolean> {
  if (await canManageEvent(ref)) return true;

  const user = await getCurrentUser();
  if (!user) return false;

  const row = await db.query.events.findFirst({
    where: "id" in ref ? eq(events.id, ref.id) : eq(events.slug, ref.slug),
    columns: { listedBy: true },
  });
  return row?.listedBy === user.id;
}
