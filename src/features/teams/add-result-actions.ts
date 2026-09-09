"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import { events, matches, eventTeams, teams } from "@/db/schema";
import { getCurrentUser } from "@/features/auth";
import { slugify } from "@/lib/slug";

import { canScheduleForTeam } from "./access";
import { checkResult, sameCompetition } from "./add-result";

/**
 * A result added by the people who were there.
 *
 * The event is the awkward part: matches.event_id is not null, and a side
 * that flew to Dallas is not going to file a tournament record to get five
 * scores in. So a competition nobody here has gets a draft event standing in
 * for it — draft because it is a placeholder, and because the events list
 * already shows only published and completed ones, so nothing has to learn to
 * hide it. If we ever import the real Dallas Cup, the two can be merged, the
 * same way two team rows are.
 *
 * The opponent is stored as a name, not a link. A result entered here is one
 * team's account of a game, and writing it into another team's row would put
 * a match on their page, and goals against their record, that nobody on that
 * side ever saw. If they turn up here later and confirm it, that is when it
 * becomes a link.
 */

export type AddResultState = { error?: string; ok?: boolean; note?: string };

async function uniqueSlug(base: string) {
  const root = base || "event";
  for (let i = 0; i < 50; i++) {
    const candidate = i === 0 ? root : `${root}-${i + 1}`;
    const taken = await db.query.events.findFirst({
      where: eq(events.slug, candidate),
      columns: { id: true },
    });
    if (!taken) return candidate;
  }
  return `${root}-${Date.now()}`;
}

/**
 * The event this result belongs under, making one only if it has to.
 *
 * Three answers, in order. A competition we already carry is used as it
 * stands — one more Surf Cup record helps nobody. A placeholder this team
 * already made for the same competition is reused, so five games from one
 * trip do not become five events. Otherwise a new placeholder.
 */
async function eventFor(
  competition: string | null,
  teamId: string,
  userId: string,
  playedOn: Date,
): Promise<{ id: string; existed: boolean; title: string }> {
  const title = competition ?? "Other results";

  const candidates = await db.query.events.findMany({
    columns: { id: true, title: true, status: true, organizerId: true },
    where: inArray(events.status, ["published", "completed", "draft"]),
  });

  const real = candidates.find(
    (e) => e.status !== "draft" && sameCompetition(e.title, title),
  );
  if (real) return { id: real.id, existed: true, title: real.title };

  const mine = candidates.find(
    (e) =>
      e.status === "draft" &&
      e.organizerId === userId &&
      sameCompetition(e.title, title),
  );
  if (mine) return { id: mine.id, existed: false, title: mine.title };

  const [made] = await db
    .insert(events)
    .values({
      slug: await uniqueSlug(slugify(title)),
      title,
      kind: "tournament",
      modules: [],
      // A placeholder, not a listing. Draft keeps it out of /events without
      // anything new having to know about it.
      status: "draft",
      visibility: "public",
      locationType: "in_person",
      startsAt: playedOn,
      /*
       * Whoever is filling this in, so they can see the placeholder they
       * made. It is not a claim that they ran the tournament — nothing here
       * says they did, and the row goes away if the real event ever arrives.
       */
      organizerId: userId,
      listedBy: userId,
    })
    .returning({ id: events.id });

  await db.insert(eventTeams).values({ eventId: made.id, teamId }).onConflictDoNothing();
  return { id: made.id, existed: false, title };
}

export async function addTeamResult(
  teamSlug: string,
  _prev: AddResultState,
  form: FormData,
): Promise<AddResultState> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sign in first." };

  const team = await db.query.teams.findFirst({
    where: eq(teams.slug, teamSlug),
    columns: { id: true },
  });
  if (!team) return { error: "No such team." };
  if (!(await canScheduleForTeam(team.id))) {
    return { error: "Only the people who manage this team can add a result." };
  }

  const checked = checkResult({
    playedOn: form.get("playedOn")?.toString(),
    opponent: form.get("opponent")?.toString(),
    ourScore: form.get("ourScore")?.toString(),
    theirScore: form.get("theirScore")?.toString(),
    competition: form.get("competition")?.toString(),
    wasHome: form.get("wasHome") === "on",
  });
  if (!checked.ok) return { error: checked.error };
  const r = checked.value;

  const event = await eventFor(r.competition, team.id, user.id, r.playedOn);
  if (event.existed) {
    /*
     * We already carry this tournament, which means its schedule came from
     * the organizer. Adding a game into it by hand would put a fixture on a
     * public schedule, and possibly into a standings table, that the
     * organizer never published. If one of their games really is missing,
     * that is a correction to make against the source, not a row to slip in.
     */
    return {
      error: `We already have ${event.title}. Your team's games there should come from the organizer — tell an admin if one is missing.`,
    };
  }

  await db.insert(matches).values({
    eventId: event.id,
    stage: "group",
    kickoffAt: r.playedOn,
    homeTeamId: r.wasHome ? team.id : null,
    awayTeamId: r.wasHome ? null : team.id,
    // The other side as a name. See the note at the top of this file.
    homePlaceholder: r.wasHome ? null : r.opponent,
    awayPlaceholder: r.wasHome ? r.opponent : null,
    homeScore: r.wasHome ? r.ourScore : r.theirScore,
    awayScore: r.wasHome ? r.theirScore : r.ourScore,
    status: "final",
    // No sourceMatchId: a match without one was entered by a person here, and
    // no connector may touch it.
    scoreSetBy: user.id,
    scoreSetAt: new Date(),
  });

  revalidatePath(`/teams/${teamSlug}`);
  return { ok: true };
}

export async function deleteTeamResult(
  teamSlug: string,
  matchId: string,
): Promise<AddResultState> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sign in first." };
  const team = await db.query.teams.findFirst({
    where: eq(teams.slug, teamSlug),
    columns: { id: true },
  });
  if (!team) return { error: "No such team." };
  if (!(await canScheduleForTeam(team.id))) return { error: "Not allowed." };

  /*
   * Only a row a person added here, and only one of this team's. The absent
   * sourceMatchId is what says so — anything a connector owns is the
   * organizer's record and is not this team's to remove.
   */
  const match = await db.query.matches.findFirst({
    where: eq(matches.id, matchId),
    columns: { id: true, sourceMatchId: true, homeTeamId: true, awayTeamId: true },
  });
  if (!match || match.sourceMatchId !== null) return { error: "Not allowed." };
  if (match.homeTeamId !== team.id && match.awayTeamId !== team.id) {
    return { error: "Not allowed." };
  }

  await db.delete(matches).where(and(eq(matches.id, matchId)));
  revalidatePath(`/teams/${teamSlug}`);
  return { ok: true };
}
