"use server";

import { and, eq, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { eventOffers, events, teams } from "@/db/schema";
import { getCurrentUser } from "@/features/auth";
import { isAdmin } from "@/features/auth/admin";

export type OfferResult = { error?: string; ok?: boolean };

export async function sendOffer(
  eventSlug: string,
  _prev: OfferResult,
  formData: FormData,
): Promise<OfferResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sign in to send an offer." };

  const teamId = String(formData.get("teamId") ?? "");
  const message = String(formData.get("message") ?? "").trim() || null;
  if (!teamId) return { error: "Pick which team you're offering." };

  const event = await db.query.events.findFirst({
    where: eq(events.slug, eventSlug),
    columns: { id: true, needsOpponent: true },
  });
  if (!event || !event.needsOpponent) return { error: "This event isn't looking for an opponent." };

  const team = await db.query.teams.findFirst({
    where: eq(teams.id, teamId),
    columns: { ownerId: true },
  });
  if (!team || team.ownerId !== user.id) return { error: "You don't manage that team." };

  await db
    .insert(eventOffers)
    .values({ eventId: event.id, fromTeamId: teamId, byUserId: user.id, message })
    .onConflictDoUpdate({
      target: [eventOffers.eventId, eventOffers.fromTeamId],
      set: { message, status: "pending" },
    });

  revalidatePath(`/events/${eventSlug}`);
  return { ok: true };
}

export async function respondToOffer(
  eventSlug: string,
  offerId: string,
  accept: boolean,
): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;

  const offer = await db.query.eventOffers.findFirst({
    where: eq(eventOffers.id, offerId),
    with: { event: { columns: { id: true, organizerId: true } } },
  });
  if (!offer) return;
  if (offer.event.organizerId !== user.id && !isAdmin(user)) return;

  if (accept) {
    await db
      .update(eventOffers)
      .set({ status: "accepted" })
      .where(eq(eventOffers.id, offerId));
    await db
      .update(eventOffers)
      .set({ status: "declined" })
      .where(and(eq(eventOffers.eventId, offer.event.id), ne(eventOffers.id, offerId)));
    await db
      .update(events)
      .set({ awayTeamId: offer.fromTeamId, needsOpponent: false, updatedAt: new Date() })
      .where(eq(events.id, offer.event.id));
  } else {
    await db
      .update(eventOffers)
      .set({ status: "declined" })
      .where(eq(eventOffers.id, offerId));
  }

  revalidatePath(`/events/${eventSlug}`);
}
