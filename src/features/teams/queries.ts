import "server-only";

import { asc, desc, eq, or } from "drizzle-orm";

import { db } from "@/db";
import { matches, teams } from "@/db/schema";

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
