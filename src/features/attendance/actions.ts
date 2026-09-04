"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { eventAttendees, events } from "@/db/schema";
import { getCurrentUser } from "@/features/auth";

type Status = "going" | "maybe";

/**
 * Set (or clear) the current user's RSVP.
 *
 * Picking the status you already have clears it — the button doubles as the
 * "actually, I can't" control, so there is no third "not going" state to store.
 */
export async function setAttendance(
  slug: string,
  status: Status,
  formData?: FormData,
): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;

  const event = await db.query.events.findFirst({
    where: eq(events.slug, slug),
    columns: { id: true, modules: true },
  });
  if (!event || !event.modules.includes("attendance")) return;

  const guests = Math.min(
    Math.max(Number(formData?.get("guests") ?? 0) || 0, 0),
    20,
  );

  const existing = await db.query.eventAttendees.findFirst({
    where: and(
      eq(eventAttendees.eventId, event.id),
      eq(eventAttendees.userId, user.id),
    ),
  });

  if (existing?.status === status) {
    await db
      .delete(eventAttendees)
      .where(
        and(
          eq(eventAttendees.eventId, event.id),
          eq(eventAttendees.userId, user.id),
        ),
      );
  } else {
    await db
      .insert(eventAttendees)
      .values({ eventId: event.id, userId: user.id, status, guests })
      .onConflictDoUpdate({
        target: [eventAttendees.eventId, eventAttendees.userId],
        set: { status, guests, updatedAt: new Date() },
      });
  }

  revalidatePath(`/events/${slug}`);
}
