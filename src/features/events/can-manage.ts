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
