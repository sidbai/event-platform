"use server";

import { and, eq, or } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import {
  eventDivisions,
  eventRegistrations,
  eventTeams,
  events,
  matches,
  teamMembers,
  teams,
} from "@/db/schema";
import { getCurrentUser } from "@/features/auth";
import { canManageEvent } from "@/features/events/can-manage";
import { checkRateLimit } from "@/features/rate-limit";
import { uniqueTeamSlug } from "@/features/teams/slug";
import { slugify } from "@/lib/slug";

import { opennessOf } from "./openness";
import { participationFor, type RegistrationStatus } from "./participation";

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

  return recordEntry(slug, event.id, divisionId, teamId, user.id, note);
}

/**
 * The half of entering a team that does not depend on where the team came
 * from: is the division real, is it open, and record the request.
 *
 * Shared rather than copied, because there are now two doors into it — a team
 * that already exists, and one created on the spot — and a capacity check that
 * only guarded one of them would be a division that quietly overfills through
 * the other.
 */
async function recordEntry(
  slug: string,
  eventId: string,
  divisionId: string,
  teamId: string,
  userId: string,
  note: string,
): Promise<RegistrationResult> {
  const division = await db.query.eventDivisions.findFirst({
    where: and(eq(eventDivisions.id, divisionId), eq(eventDivisions.eventId, eventId)),
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
      eventId,
      divisionId,
      teamId,
      requestedBy: userId,
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
        requestedBy: userId,
        feeCentsAtRequest: division.feeCents,
        updatedAt: new Date(),
      },
    });

  revalidatePath(`/events/${slug}/register`);
  revalidatePath(`/events/${slug}`);
  return { ok: true };
}

/**
 * Enter a team that does not exist yet.
 *
 * A tournament or league here is mostly community teams — a parent putting a
 * neighbourhood side together for one weekend — and the entry form used to
 * dead-end for exactly that person: "you don't manage a team yet", followed by
 * a club-shaped form asking for a club, a city, an age group and a crest, and
 * then a walk back to the event.
 *
 * So a name is enough. Everything else about the team can be filled in later,
 * or never, and the entry is what the organizer actually needs.
 */
export async function registerNewTeam(
  slug: string,
  _prev: RegistrationResult,
  formData: FormData,
): Promise<RegistrationResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sign in to enter a team." };

  const gate = await checkRateLimit("event:create", user);
  if (!gate.ok) return { error: gate.message };

  const divisionId = String(formData.get("divisionId") ?? "");
  const name = String(formData.get("teamName") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim().slice(0, 500);
  if (!divisionId) return { error: "Pick a division." };
  if (name.length < 2) return { error: "Give the team a name." };
  if (name.length > 80) return { error: "That name is too long." };

  const event = await db.query.events.findFirst({
    where: eq(events.slug, slug),
    columns: { id: true, status: true },
  });
  if (!event) return { error: "That event is gone." };
  if (event.status !== "published" && event.status !== "completed") {
    return { error: "This event isn't open for entries." };
  }

  // Checked before the team is made, so a closed division does not leave a
  // stray team behind for someone to wonder about later.
  const division = await db.query.eventDivisions.findFirst({
    where: and(eq(eventDivisions.id, divisionId), eq(eventDivisions.eventId, event.id)),
    columns: { id: true },
  });
  if (!division) return { error: "That division is gone." };

  const [team] = await db
    .insert(teams)
    .values({
      slug: await uniqueTeamSlug(slugify(name).slice(0, 60)),
      name,
      // Public, like any team someone creates deliberately. The private ones
      // are the stubs an organizer types in on the scores page, which nobody
      // has claimed.
      visibility: "public",
      originEventId: event.id,
      ownerId: user.id,
    })
    .returning({ id: teams.id });

  await db
    .insert(teamMembers)
    .values({ teamId: team.id, userId: user.id, role: "owner" })
    .onConflictDoNothing();

  return recordEntry(slug, event.id, divisionId, team.id, user.id, note);
}

/**
 * Give effect to a decision on an entry.
 *
 * The status is the record of what the organizer decided; event_teams is the
 * team's place in the competition. Keeping them in step here is what makes
 * "Accept" mean something — before this it only changed a label, and the team
 * had to be typed in a second time on the scores page.
 */
async function syncParticipation(
  eventId: string,
  teamId: string,
  divisionId: string,
  status: RegistrationStatus,
) {
  const [existing, fixture] = await Promise.all([
    db.query.eventTeams.findFirst({
      where: and(eq(eventTeams.eventId, eventId), eq(eventTeams.teamId, teamId)),
      columns: { id: true, divisionId: true },
    }),
    db.query.matches.findFirst({
      where: and(
        eq(matches.eventId, eventId),
        or(eq(matches.homeTeamId, teamId), eq(matches.awayTeamId, teamId)),
      ),
      columns: { id: true },
    }),
  ]);

  const change = participationFor(status, divisionId, {
    participating: Boolean(existing),
    divisionId: existing?.divisionId ?? null,
    hasFixtures: Boolean(fixture),
  });

  if (change.action === "enter") {
    await db
      .insert(eventTeams)
      .values({ eventId, teamId, divisionId: change.divisionId })
      // Only the division moves. The standings columns are left alone, so
      // re-filing a team mid-season does not wipe what it has played.
      .onConflictDoUpdate({
        target: [eventTeams.eventId, eventTeams.teamId],
        set: { divisionId: change.divisionId },
      });
  } else if (change.action === "remove") {
    await db.delete(eventTeams).where(eq(eventTeams.id, existing!.id));
  }
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

  const reg = await db.query.eventRegistrations.findFirst({
    where: eq(eventRegistrations.id, registrationId),
    columns: { eventId: true, divisionId: true, teamId: true },
  });
  if (!reg) return;

  await db
    .update(eventRegistrations)
    .set({ status, updatedAt: new Date() })
    .where(eq(eventRegistrations.id, registrationId));

  await syncParticipation(reg.eventId, reg.teamId, reg.divisionId, status);

  revalidatePath(`/events/${slug}/register`);
  revalidatePath(`/events/${slug}/registrations`);
  revalidatePath(`/events/${slug}/table`);
  revalidatePath(`/events/${slug}/scores`);
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
    columns: { eventId: true, divisionId: true, teamId: true },
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

  await syncParticipation(reg.eventId, reg.teamId, reg.divisionId, "withdrawn");

  revalidatePath(`/events/${slug}/register`);
  revalidatePath(`/events/${slug}/registrations`);
  revalidatePath(`/events/${slug}/table`);
  revalidatePath(`/events/${slug}/scores`);
}
