import "server-only";

import { and, desc, eq, inArray, isNull, lt, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  clubs,
  coachClaims,
  coaches,
  comments,
  discussions,
  eventInvites,
  events,
  forumPosts,
  matches,
  reviews,
  teamClaims,
  teamInvites,
  teams,
} from "@/db/schema";
import { unreadCount } from "@/features/messages/queries";
import { requestsWaitingFor } from "@/features/training/queries";

/**
 * The two questions a personal page answers that no other page can.
 *
 * Not everything a person owns. A page that lists every table with their id
 * in it is a page of empty boxes for everybody who has not used the site
 * much, which here is everybody — so each of these earns its place by being
 * something you cannot find anywhere else, and a section with nothing to say
 * is not rendered at all.
 */

export type Waiting = {
  kind: "invite" | "claim" | "scores" | "messages" | "training";
  what: string;
  detail: string | null;
  href: string;
};

/**
 * Things that will sit there until this person does something.
 *
 * The most valuable section and the easiest to miss: an invitation nobody
 * mentioned, a claim quietly approved a week ago, an event of your own with
 * Saturday's scores still empty. None of it is anywhere a person would think
 * to look, which is the argument for the page.
 */
export async function waitingOn(userId: string): Promise<Waiting[]> {
  const out: Waiting[] = [];

  const [invitedToTeams, invitedToEvents, teamClaimRows, coachClaimRows, unread, requests] =
    await Promise.all([
      db
        .select({ team: teams.name, slug: teams.slug })
        .from(teamInvites)
        .innerJoin(teams, eq(teams.id, teamInvites.teamId))
        .where(
          and(eq(teamInvites.invitedUserId, userId), eq(teamInvites.status, "pending")),
        ),
      db
        .select({ title: events.title, slug: events.slug })
        .from(eventInvites)
        .innerJoin(events, eq(events.id, eventInvites.eventId))
        .where(
          and(eq(eventInvites.invitedUserId, userId), eq(eventInvites.status, "pending")),
        ),
      db
        .select({ team: teams.name, slug: teams.slug, status: teamClaims.status })
        .from(teamClaims)
        .innerJoin(teams, eq(teams.id, teamClaims.teamId))
        .where(eq(teamClaims.userId, userId)),
      db
        .select({ coach: coaches.name, slug: coaches.slug, status: coachClaims.status })
        .from(coachClaims)
        .innerJoin(coaches, eq(coaches.id, coachClaims.coachId))
        .where(eq(coachClaims.userId, userId)),
      unreadCount(userId),
      requestsWaitingFor(userId, new Date()),
    ]);

  /*
   * A parent asking for a slot is a person waiting on this coach, and it is
   * the most time-bound thing on the list — Sunday comes whether or not it
   * was answered. So it leads.
   */
  if (requests.length > 0) {
    out.push({
      kind: "training",
      what:
        requests.length === 1
          ? `${requests[0].playerName} asked for a training slot`
          : `${requests.length} training requests to answer`,
      detail: requests.length === 1 ? requests[0].location : null,
      href: "/coaching",
    });
  }

  for (const row of invitedToTeams) {
    out.push({
      kind: "invite",
      what: `You have been invited to ${row.team}`,
      detail: null,
      href: `/teams/${row.slug}`,
    });
  }
  for (const row of invitedToEvents) {
    out.push({
      kind: "invite",
      what: `You have been invited to ${row.title}`,
      detail: null,
      href: `/events/${row.slug}`,
    });
  }

  /*
   * A claim is shown while it waits and once it is answered, because the
   * answer is the part nobody is told: an approval arrives as a page quietly
   * becoming editable, and a refusal as nothing at all.
   */
  for (const row of [
    ...teamClaimRows.map((r) => ({ ...r, subject: r.team, href: `/teams/${r.slug}` })),
    ...coachClaimRows.map((r) => ({ ...r, subject: r.coach, href: `/coaches/${r.slug}` })),
  ]) {
    if (row.status === "pending") {
      out.push({
        kind: "claim",
        what: `Your claim on ${row.subject} is waiting to be reviewed`,
        detail: null,
        href: row.href,
      });
    } else if (row.status === "approved") {
      out.push({
        kind: "claim",
        what: `You now manage ${row.subject}`,
        detail: "Your claim was approved.",
        href: row.href,
      });
    }
  }

  /*
   * An event this person runs, with a game that has been played and never
   * filled in. Only their own: everybody else's unscored fixtures are the
   * organizer's business, and there are thousands of them.
   */
  const unscored = await db
    .select({
      title: events.title,
      slug: events.slug,
      games: sql<number>`count(*)`.mapWith(Number),
    })
    .from(matches)
    .innerJoin(events, eq(events.id, matches.eventId))
    .where(
      and(
        eq(events.organizerId, userId),
        isNull(matches.homeScore),
        lt(matches.kickoffAt, new Date()),
      ),
    )
    .groupBy(events.id, events.title, events.slug);

  for (const row of unscored) {
    out.push({
      kind: "scores",
      what: `${row.title} has ${row.games} game${row.games === 1 ? "" : "s"} with no score`,
      detail: "Played, and nobody has filled them in.",
      href: `/events/${row.slug}/scores`,
    });
  }

  if (unread > 0) {
    out.push({
      kind: "messages",
      what: `${unread} unread conversation${unread === 1 ? "" : "s"}`,
      detail: null,
      href: "/messages",
    });
  }

  return out;
}

export type Written = {
  kind: "post" | "comment" | "review";
  title: string;
  where: string;
  href: string;
  at: Date;
};

/**
 * What this person has written, in one list.
 *
 * The reason it exists is narrower than it looks: there is no way to find
 * your own review of a club except by remembering which club it was. A
 * comment is the same — it lives under whatever it was about, and nothing
 * gathers them. Hidden ones are left out; they are still readable to a
 * moderator and this is not that page.
 */
/**
 * Name and address for a set of ids from one table.
 *
 * The tables differ in which column holds the name — title on an event and a
 * forum post, name on a club — so each caller says which, and the rest is the
 * same query five times over.
 */
async function lookup(
  table: typeof clubs | typeof coaches | typeof events | typeof teams | typeof forumPosts,
  ids: string[],
): Promise<{ id: string; name: string; slug: string }[]> {
  if (ids.length === 0) return [];
  const name = "title" in table ? table.title : table.name;
  return db
    .select({ id: table.id, name, slug: table.slug })
    .from(table)
    .where(inArray(table.id, ids));
}

export async function written(userId: string, limit = 20): Promise<Written[]> {
  const [posts, said, wrote] = await Promise.all([
    db
      .select({ title: forumPosts.title, slug: forumPosts.slug, at: forumPosts.createdAt })
      .from(forumPosts)
      .where(and(eq(forumPosts.authorId, userId), isNull(forumPosts.hiddenAt)))
      .orderBy(desc(forumPosts.createdAt))
      .limit(limit),
    db
      .select({
        body: comments.body,
        at: comments.createdAt,
        subjectType: discussions.subjectType,
        subjectId: discussions.subjectId,
      })
      .from(comments)
      .innerJoin(discussions, eq(discussions.id, comments.discussionId))
      .where(and(eq(comments.authorId, userId), isNull(comments.hiddenAt)))
      .orderBy(desc(comments.createdAt))
      .limit(limit),
    db
      .select({
        title: reviews.title,
        at: reviews.createdAt,
        subjectType: reviews.subjectType,
        subjectId: reviews.subjectId,
      })
      .from(reviews)
      .where(and(eq(reviews.authorId, userId), isNull(reviews.hiddenAt)))
      .orderBy(desc(reviews.createdAt))
      .limit(limit),
  ]);

  /*
   * A comment and a review point at their subjects with different words.
   *
   * discussion_subject is {event, team, post, forum_post, news_post} and
   * review_subject is {club, coach} — two vocabularies that do not overlap at
   * all. Treating them as one dropped every comment on a team or an event,
   * silently, because the lookup only knew how to find clubs and coaches.
   * Caught by putting a real comment in and watching it not appear.
   */
  const idsOf = (type: string) =>
    [
      ...said.filter((r) => r.subjectType === type).map((r) => r.subjectId),
      ...wrote.filter((r) => r.subjectType === type).map((r) => r.subjectId),
    ];

  const [clubRows, coachRows, eventRows, teamRows, postRows] = await Promise.all([
    /*
     * inArray rather than a hand-written `in`, which is where a list of ids
     * stops being data and starts being part of the statement. Three separate
     * bugs this week began that way.
     */
    lookup(clubs, idsOf("club")),
    lookup(coaches, idsOf("coach")),
    lookup(events, idsOf("event")),
    lookup(teams, idsOf("team")),
    lookup(forumPosts, idsOf("forum_post")),
  ]);

  const subject = new Map<string, { name: string; href: string }>();
  for (const c of clubRows) subject.set(c.id, { name: c.name, href: `/clubs/${c.slug}` });
  for (const c of coachRows) subject.set(c.id, { name: c.name, href: `/coaches/${c.slug}` });
  for (const e of eventRows) subject.set(e.id, { name: e.name, href: `/events/${e.slug}` });
  for (const t of teamRows) subject.set(t.id, { name: t.name, href: `/teams/${t.slug}` });
  for (const p of postRows) {
    subject.set(p.id, { name: p.name, href: `/community/${p.slug}` });
  }

  const items: Written[] = [
    ...posts.map((p) => ({
      kind: "post" as const,
      title: p.title,
      where: "Community",
      href: `/community/${p.slug}`,
      at: p.at,
    })),
    ...said.flatMap((c) => {
      const on = subject.get(c.subjectId);
      return on
        ? [{
            kind: "comment" as const,
            // The first line, which is what a person recognises it by.
            title: c.body.split("\n")[0].slice(0, 120),
            where: on.name,
            href: on.href,
            at: c.at,
          }]
        : [];
    }),
    ...wrote.flatMap((r) => {
      const on = subject.get(r.subjectId);
      return on
        ? [{
            kind: "review" as const,
            title: r.title ?? "Your review",
            where: on.name,
            href: on.href,
            at: r.at,
          }]
        : [];
    }),
  ];

  return items.sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, limit);
}
