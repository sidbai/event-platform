"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { eventFollows, events } from "@/db/schema";
import { getCurrentUser } from "@/features/auth";
import { checkRateLimit } from "@/features/rate-limit";

/**
 * Follow an event, or stop.
 *
 * A toggle rather than two calls, so a double click cannot leave a stray row —
 * the primary key means the state is simply present or not.
 *
 * The event is looked up by slug here rather than taking an id from the page:
 * a page that hands an id up is a page whose id can be swapped for another.
 */
export async function toggleEventFollow(slug: string): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;

  const gate = await checkRateLimit("follow:toggle", user);
  if (!gate.ok) return;

  const event = await db.query.events.findFirst({
    where: eq(events.slug, slug),
    columns: { id: true },
  });
  if (!event) return;

  const where = and(eq(eventFollows.userId, user.id), eq(eventFollows.eventId, event.id));
  const existing = await db.query.eventFollows.findFirst({
    where,
    columns: { eventId: true },
  });

  if (existing) {
    await db.delete(eventFollows).where(where);
  } else {
    await db
      .insert(eventFollows)
      .values({ eventId: event.id, userId: user.id })
      .onConflictDoNothing();
  }

  revalidatePath(`/events/${slug}`);
  revalidatePath("/me");
}
