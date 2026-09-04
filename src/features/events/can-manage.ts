import "server-only";

import { eq } from "drizzle-orm";

import { db } from "@/db";
import { events } from "@/db/schema";
import { getCurrentUser } from "@/features/auth";
import { isAdmin } from "@/features/auth/admin";

/**
 * True if the current user may manage this event — its organizer, or an admin.
 * Pass the event's `organizerId` if you already have it to skip a query.
 */
export async function canManageEvent(
  eventIdOrSlug: { id: string } | { slug: string } | { organizerId: string | null },
): Promise<boolean> {
  const user = await getCurrentUser();
  if (!user) return false;
  if (isAdmin(user)) return true;

  if ("organizerId" in eventIdOrSlug) {
    return eventIdOrSlug.organizerId === user.id;
  }

  const row = await db.query.events.findFirst({
    where:
      "id" in eventIdOrSlug
        ? eq(events.id, eventIdOrSlug.id)
        : eq(events.slug, eventIdOrSlug.slug),
    columns: { organizerId: true },
  });
  return row?.organizerId === user.id;
}
