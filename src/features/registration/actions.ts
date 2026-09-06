"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { eventDivisions, eventRegistrations, events, teamMembers } from "@/db/schema";
import { getCurrentUser } from "@/features/auth";
import { canManageEvent } from "@/features/events/can-manage";
import { checkRateLimit } from "@/features/rate-limit";

import { opennessOf } from "./openness";

export type RegistrationResult = { error?: string; ok?: boolean };

/**
 * Enter a team into a division.
 *
 * No money changes hands here. The fee is recorded as it stood at the time so
 * that raising a price later cannot change what an already-registered team was
 * told, but collecting it is the organizer's business, off the platform.
 */
export async function registerTeam(
  slug: string,
  _prev: RegistrationResult,
  formData: FormData,
): Promise<RegistrationResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sign in to enter a team." };

  const gate = await checkRateLimit("event:create", user);
  if (!gate.ok) return { error: gate.message };

  const divisionId = String(formData.get("divisionId") ?? "");
  const teamId = String(formData.get("teamId") ?? "");
  const note = String(formData.get("note") ?? "").trim().slice(0, 500);
  if (!divisionId || !teamId) return { error: "Pick a team and a division." };

  const event = await db.query.events.findFirst({
    where: eq(events.slug, slug),
    columns: { id: true, status: true },
  });
  if (!event) return { error: "That event is gone." };
  // A pending event has not been approved; taking entries for it would be
  // collecting commitments to something that may never run.
  if (event.status !== "published" && event.status !== "completed") {
    return { error: "This event isn't open for entries." };
  }

  // The team has to be yours to enter. Checked against membership rather than
  // trusting the id in the form, which the browser controls.
  const membership = await db.query.teamMembers.findFirst({
    where: and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, user.id)),
    columns: { role: true },
  });
  if (!membership || !["owner", "manager", "coach"].includes(membership.role)) {
    return { error: "You can only enter a team you manage." };
  }

  const division = await db.query.eventDivisions.findFirst({
    where: and(
      eq(eventDivisions.id, divisionId),
      eq(eventDivisions.eventId, event.id),
    ),
  });
  if (!division) return { error: "That division is gone." };

  // Re-checked on the server: the page was rendered at some earlier moment,
  // and a window can close or a last place go between render and submit.
  const acceptedCount = (
    await db.query.eventRegistrations.findMany({
      where: and(
        eq(eventRegistrations.divisionId, divisionId),
        eq(eventRegistrations.status, "accepted"),
      ),
      columns: { id: true },
    })
  ).length;
  const openness = opennessOf(division, acceptedCount, new Date());
  if (!openness.open) {
    return {
      error:
        openness.reason === "full"
          ? "That division is full."
          : openness.reason === "closed"
            ? "Registration for that division has closed."
            : "Registration for that division hasn't opened yet.",
    };
  }

  await db
    .insert(eventRegistrations)
    .values({
      eventId: event.id,
      divisionId,
      teamId,
      requestedBy: user.id,
      note: note || null,
      feeCentsAtRequest: division.feeCents,
    })
    // Re-entering after withdrawing reuses the row rather than failing on the
    // unique constraint or leaving a withdrawn record beside a live one.
    .onConflictDoUpdate({
      target: [eventRegistrations.divisionId, eventRegistrations.teamId],
      set: {
        status: "requested",
        note: note || null,
        requestedBy: user.id,
        feeCentsAtRequest: division.feeCents,
        updatedAt: new Date(),
      },
    });

  revalidatePath(`/events/${slug}/register`);
  revalidatePath(`/events/${slug}`);
  return { ok: true };
}

/** Organizer or admin: decide on a registration. */
export async function setRegistrationStatus(
  slug: string,
  registrationId: string,
  status: "accepted" | "waitlisted" | "declined",
): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;
  if (!(await canManageEvent({ slug }))) return;

  await db
    .update(eventRegistrations)
    .set({ status, updatedAt: new Date() })
    .where(eq(eventRegistrations.id, registrationId));

  revalidatePath(`/events/${slug}/register`);
  revalidatePath(`/events/${slug}/registrations`);
}

/** The team's own way out, without needing the organizer. */
export async function withdrawRegistration(
  slug: string,
  registrationId: string,
): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;

  const reg = await db.query.eventRegistrations.findFirst({
    where: eq(eventRegistrations.id, registrationId),
    columns: { teamId: true },
  });
  if (!reg) return;

  const membership = await db.query.teamMembers.findFirst({
    where: and(
      eq(teamMembers.teamId, reg.teamId),
      eq(teamMembers.userId, user.id),
    ),
    columns: { role: true },
  });
  const mayManage = await canManageEvent({ slug });
  if (!membership && !mayManage) return;

  await db
    .update(eventRegistrations)
    .set({ status: "withdrawn", updatedAt: new Date() })
    .where(eq(eventRegistrations.id, registrationId));

  revalidatePath(`/events/${slug}/register`);
  revalidatePath(`/events/${slug}/registrations`);
}
