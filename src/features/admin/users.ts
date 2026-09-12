import "server-only";

import { count, desc, eq, gt, ilike, max, or, sql } from "drizzle-orm";

import { db } from "@/db";
import { accounts, eventFollows, sessions, teamFollows, teams, users } from "@/db/schema";
import { isAdmin } from "@/features/auth/admin";
import { paginate } from "@/features/pagination/paginate";

/**
 * Everyone who has an account, newest first, for the admin screen.
 *
 * One query, with the counts folded in as subqueries: nine users today,
 * but a page that runs a query per row is the kind of page that is fine
 * until the day it is not, and the counts are the whole reason to look —
 * "signed up and followed nothing" and "signed up and follows twelve
 * teams" are the two stories this screen is for.
 *
 * Sessions say who is signed in *now* (an unexpired one), not who was last
 * here: the auth tables keep no last-seen, and inventing one from a
 * session's expiry would be a guess dressed as a timestamp.
 */
export async function registeredUsers(page: number, perPage: number, q: string | null) {
  const needle = q ? `%${q}%` : null;
  const where = needle
    ? or(
        ilike(users.email, needle),
        ilike(users.name, needle),
        ilike(users.username, needle),
        ilike(users.displayName, needle),
      )
    : undefined;

  const pagination = paginate(await db.$count(users, where), page, perPage);

  const followedTeams = db
    .select({ userId: teamFollows.userId, n: count().as("teams_followed") })
    .from(teamFollows)
    .groupBy(teamFollows.userId)
    .as("ft");
  const followedEvents = db
    .select({ userId: eventFollows.userId, n: count().as("events_followed") })
    .from(eventFollows)
    .groupBy(eventFollows.userId)
    .as("fe");
  const owned = db
    .select({ ownerId: teams.ownerId, n: count().as("teams_owned") })
    .from(teams)
    .groupBy(teams.ownerId)
    .as("ow");
  const providers = db
    .select({
      userId: accounts.userId,
      list: sql<string>`string_agg(distinct ${accounts.provider}, ', ')`.as("providers"),
    })
    .from(accounts)
    .groupBy(accounts.userId)
    .as("pr");
  const live = db
    .select({ userId: sessions.userId, until: max(sessions.expires).as("until") })
    .from(sessions)
    .where(gt(sessions.expires, sql`now()`))
    .groupBy(sessions.userId)
    .as("lv");

  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      username: users.username,
      displayName: users.displayName,
      city: users.city,
      emailVerified: users.emailVerified,
      createdAt: users.createdAt,
      teamsFollowed: sql<number>`coalesce(${followedTeams.n}, 0)::int`,
      eventsFollowed: sql<number>`coalesce(${followedEvents.n}, 0)::int`,
      teamsOwned: sql<number>`coalesce(${owned.n}, 0)::int`,
      providers: providers.list,
      signedInUntil: live.until,
    })
    .from(users)
    .leftJoin(followedTeams, eq(followedTeams.userId, users.id))
    .leftJoin(followedEvents, eq(followedEvents.userId, users.id))
    .leftJoin(owned, eq(owned.ownerId, users.id))
    .leftJoin(providers, eq(providers.userId, users.id))
    .leftJoin(live, eq(live.userId, users.id))
    .where(where)
    .orderBy(desc(users.createdAt))
    .limit(pagination.perPage)
    .offset(pagination.offset);

  return {
    pagination,
    rows: rows.map((u) => ({
      ...u,
      admin: isAdmin({ email: u.email }),
      signedIn: u.signedInUntil !== null,
    })),
  };
}
