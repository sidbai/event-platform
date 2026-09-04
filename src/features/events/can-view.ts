import "server-only";

import { and, eq, or } from "drizzle-orm";

import { db } from "@/db";
import { eventInvites } from "@/db/schema";
import type { CurrentUser } from "@/features/auth";
import { isAdmin, normalizeEmail } from "@/features/auth/admin";
import { isTeamMember } from "@/features/teams/access";

import { viewDecision, type ViewableEvent } from "./view-decision";

export type { ViewableEvent };

/**
 * Who may open an event page.
 *
 * The decision itself is pure (see viewDecision) so it can be tested without a
 * database; only the "private, is this person on the guest list" branch needs a
 * query.
 */
export async function canViewEvent(
  event: ViewableEvent,
  user: CurrentUser | null,
): Promise<boolean> {
  const decision = viewDecision(event, user?.id ?? null, isAdmin(user));
  if (decision !== "check-access") return decision === "allow";
  if (!user) return false;

  // A team's own event is visible to the whole team — that is the point of
  // hosting it as a team, rather than inviting twenty people one at a time.
  if (event.hostTeamId && (await isTeamMember(event.hostTeamId, user.id)))
    return true;

  return isInvited(event.id, user);
}

export async function isInvited(eventId: string, user: CurrentUser) {
  const targets = [eq(eventInvites.invitedUserId, user.id)];
  // Email invites are stored normalized, so a Google address with dots or a
  // +tag still matches what the organizer typed.
  if (user.email) targets.push(eq(eventInvites.email, normalizeEmail(user.email)));

  const row = await db.query.eventInvites.findFirst({
    where: and(eq(eventInvites.eventId, eventId), or(...targets)),
    columns: { id: true },
  });
  return Boolean(row);
}
