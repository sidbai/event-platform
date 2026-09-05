import "server-only";

import { and, asc, desc, eq, inArray, isNull, or } from "drizzle-orm";

import { db } from "@/db";
import { events, matches, teamMembers, teams } from "@/db/schema";

/** The public team directory — event-only teams are excluded. */
export async function listTeams() {
  return db.query.teams.findMany({
    where: eq(teams.visibility, "public"),
    orderBy: [asc(teams.name)],
    with: {
      eventTeams: { columns: { eventId: true } },
    },
  });
}

export async function getTeamBySlug(slug: string) {
  const team = await db.query.teams.findFirst({
    where: eq(teams.slug, slug),
    with: {
      originEvent: { columns: { slug: true, title: true } },
      members: {
        with: {
          user: {
            columns: {
              name: true,
              displayName: true,
              username: true,
              email: true,
              image: true,
            },
          },
        },
      },
      eventTeams: {
        orderBy: (et, { desc: d }) => [d(et.points)],
        with: { event: true, division: true },
      },
    },
  });
  if (!team) return null;

  const playedMatches = await db.query.matches.findMany({
    where: or(eq(matches.homeTeamId, team.id), eq(matches.awayTeamId, team.id)),
    orderBy: [desc(matches.kickoffAt)],
    with: {
      event: { columns: { slug: true, title: true } },
      division: { columns: { name: true } },
      homeTeam: { columns: { name: true, slug: true, crestUrl: true } },
      awayTeam: { columns: { name: true, slug: true, crestUrl: true } },
    },
  });

  return { ...team, matches: playedMatches };
}

export type TeamDetail = NonNullable<Awaited<ReturnType<typeof getTeamBySlug>>>;

/**
 * Events this team hosts. Private ones are only included for members — the
 * whole point of a private team event is that outsiders can't see it.
 */
export async function hostedEvents(teamId: string, includePrivate: boolean) {
  return db.query.events.findMany({
    where: includePrivate
      ? eq(events.hostTeamId, teamId)
      : and(
          eq(events.hostTeamId, teamId),
          eq(events.visibility, "public"),
          isNull(events.hiddenAt),
        ),
    orderBy: [desc(events.startsAt)],
    limit: 20,
    columns: {
      id: true,
      slug: true,
      title: true,
      kind: true,
      startsAt: true,
      visibility: true,
    },
  });
}

/**
 * Every team the signed-in user belongs to, private ones included.
 *
 * The directory only lists public teams and a public profile deliberately
 * hides private ones, so without this a team you created privately is
 * reachable only by remembering its URL.
 */
export async function myTeams(userId: string) {
  const memberships = await db.query.teamMembers.findMany({
    where: eq(teamMembers.userId, userId),
    columns: { teamId: true, role: true },
  });
  const roleByTeam = new Map(memberships.map((m) => [m.teamId, m.role]));
  const ids = memberships.map((m) => m.teamId);

  const rows = await db.query.teams.findMany({
    where:
      ids.length > 0
        ? or(eq(teams.ownerId, userId), inArray(teams.id, ids))
        : eq(teams.ownerId, userId),
    columns: {
      id: true,
      slug: true,
      name: true,
      crestUrl: true,
      visibility: true,
      ageGroup: true,
      city: true,
    },
    orderBy: [asc(teams.name)],
  });

  return rows.map((t) => ({
    ...t,
    // Claiming predates team_members, so fall back to owner for older teams.
    role: roleByTeam.get(t.id) ?? "owner",
  }));
}
