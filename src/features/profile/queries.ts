import "server-only";

import { and, desc, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import { events, teams, users } from "@/db/schema";

export async function getProfileByUsername(username: string) {
  const user = await db.query.users.findFirst({
    where: eq(users.username, username),
    columns: {
      id: true,
      username: true,
      displayName: true,
      name: true,
      image: true,
      avatarUrl: true,
      tags: true,
      club: true,
      bio: true,
      city: true,
      createdAt: true,
    },
  });
  if (!user) return null;

  const [ownedTeams, organizedEvents] = await Promise.all([
    db.query.teams.findMany({
      where: and(eq(teams.claimedBy, user.id), eq(teams.visibility, "public")),
      columns: { slug: true, name: true, crestUrl: true },
      orderBy: [teams.name],
    }),
    db.query.events.findMany({
      where: and(
        eq(events.organizerId, user.id),
        inArray(events.status, ["published", "completed"]),
      ),
      columns: { slug: true, title: true, startsAt: true },
      orderBy: [desc(events.startsAt)],
      limit: 20,
    }),
  ]);

  return { ...user, ownedTeams, organizedEvents };
}
