import "server-only";

import { eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import { events, teamMembers, teams, users } from "@/db/schema";
import { publicName, type CurrentUser } from "@/features/auth";
import { canViewEvent } from "@/features/events/can-view";
import { canViewTeam } from "@/features/teams/access";

export type SubjectType = "event" | "team" | "offer";

export type ResolvedSubject = {
  id: string;
  type: SubjectType;
  label: string;
  href: string;
  /** Who is answerable for it, and therefore who a message reaches. */
  recipientIds: string[];
  canSee: boolean;
};

/**
 * Turn a subject into who it reaches, reusing the SAME visibility gates as the
 * pages themselves.
 *
 * That reuse is the point: if messaging resolved visibility its own way, a
 * private event would eventually become reachable through the inbox after
 * someone tightened only the page.
 */
export async function resolveSubject(
  type: SubjectType,
  slug: string,
  user: CurrentUser | null,
): Promise<ResolvedSubject | null> {
  if (type === "event") {
    const event = await db.query.events.findFirst({
      where: eq(events.slug, slug),
    });
    if (!event) return null;
    return {
      id: event.id,
      type: "event",
      label: event.title,
      href: `/events/${event.slug}`,
      // The organizer is the person answerable for an event.
      recipientIds: event.organizerId ? [event.organizerId] : [],
      canSee: await canViewEvent(event, user),
    };
  }

  if (type === "team") {
    const team = await db.query.teams.findFirst({ where: eq(teams.slug, slug) });
    if (!team) return null;
    const staff = await db.query.teamMembers.findMany({
      where: eq(teamMembers.teamId, team.id),
      columns: { userId: true, role: true },
    });
    return {
      id: team.id,
      type: "team",
      label: team.name,
      href: `/teams/${team.slug}`,
      // Managers and the owner, not every player — a message about a team
      // should reach whoever can act on it.
      recipientIds: staff
        .filter((m) => m.role === "owner" || m.role === "manager")
        .map((m) => m.userId),
      canSee: await canViewTeam(team, user?.id ?? null),
    };
  }

  return null;
}

/** Names for the people in a thread, for the header. */
export async function namesFor(userIds: string[]) {
  if (userIds.length === 0) return new Map<string, string>();
  const rows = await db.query.users.findMany({
    where: inArray(users.id, userIds),
    columns: { id: true, displayName: true, name: true, username: true },
  });
  return new Map(rows.map((u) => [u.id, publicName(u)]));
}
