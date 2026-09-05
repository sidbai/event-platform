"use server";

import { randomBytes } from "node:crypto";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { eventInvites, events, users } from "@/db/schema";
import { getCurrentUser } from "@/features/auth";
import { checkRateLimit } from "@/features/rate-limit";
import { isAdmin, normalizeEmail } from "@/features/auth/admin";

export type InviteResult = { error?: string; ok?: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function manageableEvent(slug: string) {
  const user = await getCurrentUser();
  if (!user) return null;
  const event = await db.query.events.findFirst({
    where: eq(events.slug, slug),
    columns: { id: true, organizerId: true },
  });
  if (!event) return null;
  if (event.organizerId !== user.id && !isAdmin(user)) return null;
  return { event, user };
}

/**
 * Invite someone to an event by @username or email address.
 *
 * A username resolves to a user invite; anything else is treated as an email.
 * Emails are stored normalized so the invite still matches when the person
 * signs in with a dotted or +tagged Google address.
 */
export async function inviteToEvent(
  slug: string,
  _prev: InviteResult,
  formData: FormData,
): Promise<InviteResult> {
  const ctx = await manageableEvent(slug);
  if (!ctx) return { error: "You can't invite people to this event." };

  const gate = await checkRateLimit("invite:send", ctx.user);
  if (!gate.ok) return { error: gate.message };

  const raw = String(formData.get("who") ?? "").trim();
  if (!raw) return { error: "Enter a username or email." };

  const handle = raw.replace(/^@/, "").toLowerCase();
  const byUsername = await db.query.users.findFirst({
    where: eq(users.username, handle),
    columns: { id: true },
  });

  let invitedUserId: string | null = byUsername?.id ?? null;
  let email: string | null = null;

  if (!invitedUserId) {
    if (!EMAIL_RE.test(raw)) return { error: `No user "@${handle}" — or use an email.` };
    const normalized = normalizeEmail(raw);
    // If that address already belongs to an account, invite the account so the
    // invite shows up for them without waiting on an email match.
    const existing = await db.query.users.findFirst({
      where: eq(users.email, raw.trim().toLowerCase()),
      columns: { id: true },
    });
    if (existing) invitedUserId = existing.id;
    else email = normalized;
  }

  if (invitedUserId === ctx.user.id)
    return { error: "You're the organizer — you're already in." };

  const dupe = await db.query.eventInvites.findFirst({
    where: and(
      eq(eventInvites.eventId, ctx.event.id),
      invitedUserId
        ? eq(eventInvites.invitedUserId, invitedUserId)
        : eq(eventInvites.email, email!),
    ),
    columns: { id: true },
  });
  if (dupe) return { error: "Already invited." };

  await db.insert(eventInvites).values({
    eventId: ctx.event.id,
    invitedUserId,
    email,
    invitedBy: ctx.user.id,
    token: randomBytes(16).toString("base64url"),
  });

  revalidatePath(`/events/${slug}/invite`);
  return { ok: `Invited ${raw}.` };
}

export async function revokeEventInvite(
  slug: string,
  inviteId: string,
): Promise<void> {
  const ctx = await manageableEvent(slug);
  if (!ctx) return;
  await db
    .delete(eventInvites)
    .where(
      and(eq(eventInvites.id, inviteId), eq(eventInvites.eventId, ctx.event.id)),
    );
  revalidatePath(`/events/${slug}/invite`);
}

/*
 * There is deliberately no accept/decline here yet. An invite is an access
 * grant; whether someone is actually coming is what the RSVP section answers,
 * and duplicating that into the invite would give organizers two half-answers
 * instead of one. The status column is carried for when that changes.
 */
