"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { eventAttendees, events } from "@/db/schema";
import { getCurrentUser } from "@/features/auth";

import { countGoing } from "./headcount";
import { roomFor } from "./room";

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
    columns: { id: true, modules: true, capacity: true },
  });
  if (!event || !event.modules.includes("attendance")) return;

  const guests = Math.min(
    Math.max(Number(formData?.get("guests") ?? 0) || 0, 0),
    20,
  );
  // "Joshua, 2015 — he's a keeper." Short, and only ever what they typed.
  const note = String(formData?.get("note") ?? "").trim().slice(0, 200) || null;

  const existing = await db.query.eventAttendees.findFirst({
    where: and(
      eq(eventAttendees.eventId, event.id),
      eq(eventAttendees.userId, user.id),
    ),
  });

  /*
   * A full event takes no more "going".
   *
   * The page already says "Full" — but a training slot for one player is
   * booked by whoever says going first, and a hint on a page is not a rule.
   * Somebody already going may change their guests or note; somebody on
   * maybe may not move to going past capacity. Nothing here stops "maybe".
   */
  if (status === "going" && event.capacity != null) {
    const { headcount } = await countGoing(event.id);
    const room = roomFor({
      status,
      existing: existing?.status ?? null,
      capacity: event.capacity,
      headcount,
      mine: existing?.status === "going" ? 1 + existing.guests : 0,
      guests,
    });
    if (!room) {
      revalidatePath(`/events/${slug}`);
      return;
    }
  }

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
      .values({ eventId: event.id, userId: user.id, status, guests, note })
      .onConflictDoUpdate({
        target: [eventAttendees.eventId, eventAttendees.userId],
        set: { status, guests, note, updatedAt: new Date() },
      });
  }

  revalidatePath(`/events/${slug}`);
}
