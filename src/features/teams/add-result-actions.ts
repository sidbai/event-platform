"use server";

import { revalidatePath } from "next/cache";
import { and, eq, ilike, inArray, ne } from "drizzle-orm";

import { db } from "@/db";
import { searchTerms } from "@/features/search/terms";
import { events, matchProposals, matches, eventTeams, teams } from "@/db/schema";
import { getCurrentUser } from "@/features/auth";
import { isAdmin } from "@/features/auth/admin";
import { slugify } from "@/lib/slug";

import { canScheduleForTeam } from "./access";
import { checkResult, sameCompetition } from "./add-result";
import { teamFactsFrom } from "./facts";
import { uniqueTeamSlug } from "./slug";

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

export type OpponentHit = { id: string; name: string; slug: string };

/**
 * Teams that might be the one they mean.
 *
 * Offered, never applied: picking one is what links the result to a row, and
 * a name that merely matches links nothing. That is binding.ts's rule — the
 * name must match and somebody must positively agree — and a person choosing
 * from a list is the agreement.
 */
export async function searchOpponents(
  teamId: string,
  q: string,
): Promise<OpponentHit[]> {
  const text = q.trim();
  if (text.length < 3) return [];
  const terms = searchTerms(text);
  return db.query.teams.findMany({
    where: and(
      // Every word, not the phrase: a parent typing their opponent's club and
      // then its age group was getting an empty list for the extra detail.
      ...terms.map((term) => ilike(teams.name, term)),
      eq(teams.visibility, "public"),
      // Not itself, and not a placeholder standing in for a competition.
      ne(teams.id, teamId),
    ),
    columns: { id: true, name: true, slug: true },
    limit: 6,
  });
}

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
/** A competition we already carry under this name, if there is one. */
async function carriedAlready(competition: string | null) {
  const title = competition ?? "Other results";
  const real = await db.query.events.findMany({
    columns: { id: true, title: true },
    where: inArray(events.status, ["published", "completed"]),
  });
  return real.find((e) => sameCompetition(e.title, title)) ?? null;
}

async function eventFor(
  competition: string | null,
  teamId: string,
  userId: string,
  playedOn: Date,
): Promise<{ id: string; title: string }> {
  const title = competition ?? "Other results";

  const candidates = await db.query.events.findMany({
    columns: { id: true, title: true, status: true, organizerId: true },
    where: eq(events.status, "draft"),
  });

  const mine = candidates.find(
    (e) =>
      e.status === "draft" &&
      e.organizerId === userId &&
      sameCompetition(e.title, title),
  );
  if (mine) return { id: mine.id, title: mine.title };

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
  return { id: made.id, title };
}

/**
 * The match itself, once it is allowed to exist.
 *
 * Shared by the two ways in — a result against a team nobody here carries,
 * which is written at once, and one against a team we do, which waits for
 * somebody on that side to agree.
 */
async function writeMatch(args: {
  eventId: string;
  teamId: string;
  opponentTeamId: string | null;
  opponentName: string | null;
  playedOn: Date;
  ourScore: number;
  theirScore: number;
  wasHome: boolean;
  byUserId: string;
}): Promise<string> {
  const [made] = await db
    .insert(matches)
    .values({
      eventId: args.eventId,
      stage: "group",
      kickoffAt: args.playedOn,
      homeTeamId: args.wasHome ? args.teamId : args.opponentTeamId,
      awayTeamId: args.wasHome ? args.opponentTeamId : args.teamId,
      // A name only where there is no row to point at, which after a search
      // means the other side is a team we have just made.
      homePlaceholder: args.wasHome || args.opponentTeamId ? null : args.opponentName,
      awayPlaceholder: !args.wasHome || args.opponentTeamId ? null : args.opponentName,
      homeScore: args.wasHome ? args.ourScore : args.theirScore,
      awayScore: args.wasHome ? args.theirScore : args.ourScore,
      status: "final",
      // No sourceMatchId: a match without one was entered by a person here,
      // and no connector may touch it.
      scoreSetBy: args.byUserId,
      scoreSetAt: new Date(),
    })
    .returning({ id: matches.id });
  if (args.opponentTeamId) {
    await db
      .insert(eventTeams)
      .values({ eventId: args.eventId, teamId: args.opponentTeamId })
      .onConflictDoNothing();
  }
  return made.id;
}

/**
 * A row for an opponent nobody here has yet.
 *
 * The same shape the sync mints for every name a platform publishes, facts
 * read off the name and all — so the duplicate finder can work with it, and
 * so two sides who both played "FC Dallas B12 Red" end up sharing an
 * opponent rather than two strings that will never meet.
 */
async function newOpponent(name: string, seasonStart: Date): Promise<string> {
  const facts = teamFactsFrom(name, { seasonStart, clubSlug: null });
  const [made] = await db
    .insert(teams)
    .values({
      slug: await uniqueTeamSlug(slugify(name).slice(0, 60)),
      name,
      visibility: "public",
      ...facts,
    })
    .returning({ id: teams.id });
  return made.id;
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

  /*
   * We already carry this tournament, which means its schedule came from the
   * organizer. Adding a game into it by hand would put a fixture on a public
   * schedule, and possibly into a standings table, that the organizer never
   * published. If one of their games really is missing, that is a correction
   * to make against the source, not a row to slip in.
   */
  const carried = await carriedAlready(r.competition);
  if (carried) {
    return {
      error: `We already have ${carried.title}. Your team's games there should come from the organizer — tell an admin if one is missing.`,
    };
  }

  /*
   * Picked from the list, which is a positive act and the only thing that
   * links a name to a row here. binding.ts settled that a name matching is
   * not enough — two clubs in one region both field a "Warriors" — so a
   * search that merely found something changes nothing on its own.
   */
  const picked = form.get("opponentTeamId")?.toString() ?? "";
  if (picked) {
    const other = await db.query.teams.findFirst({
      where: eq(teams.id, picked),
      columns: { id: true, name: true },
    });
    if (!other) return { error: "That team is gone." };
    if (other.id === team.id) return { error: "A team cannot play itself." };

    await db.insert(matchProposals).values({
      teamId: team.id,
      opponentTeamId: other.id,
      proposedBy: user.id,
      playedOn: r.playedOn,
      ourScore: r.ourScore,
      theirScore: r.theirScore,
      wasHome: r.wasHome,
      competition: r.competition,
    });
    revalidatePath(`/teams/${teamSlug}`);
    revalidatePath("/admin");
    return {
      ok: true,
      note: `${other.name} has a page here, so this goes to them or an admin to confirm before it shows.`,
    };
  }

  /*
   * Made here and not before the branch above: a proposal that is turned down
   * should leave nothing behind, and a placeholder event for a game that was
   * never agreed is exactly the kind of empty shell nobody would think to go
   * and clear up. The approval builds its own.
   */
  const event = await eventFor(r.competition, team.id, user.id, r.playedOn);
  const opponentId = await newOpponent(r.opponent, r.playedOn);
  await writeMatch({
    eventId: event.id,
    teamId: team.id,
    opponentTeamId: opponentId,
    opponentName: r.opponent,
    playedOn: r.playedOn,
    ourScore: r.ourScore,
    theirScore: r.theirScore,
    wasHome: r.wasHome,
    byUserId: user.id,
  });

  revalidatePath(`/teams/${teamSlug}`);
  return { ok: true };
}

/**
 * Who may say yes to a result against their team.
 *
 * The other side's own people, or an admin. Today that is almost always the
 * admin — one team of 2,350 has an owner — but the rule is written for the
 * platform we are building rather than the one we have, and it starts working
 * on its own as teams get claimed.
 */
async function canDecide(opponentTeamId: string): Promise<boolean> {
  const user = await getCurrentUser();
  if (!user) return false;
  if (isAdmin(user)) return true;
  return canScheduleForTeam(opponentTeamId);
}

export async function decideMatchProposal(
  proposalId: string,
  approve: boolean,
): Promise<AddResultState> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sign in first." };

  const proposal = await db.query.matchProposals.findFirst({
    where: eq(matchProposals.id, proposalId),
  });
  if (!proposal) return { error: "No such proposal." };
  if (proposal.status !== "pending") return { error: "That was already decided." };
  if (!(await canDecide(proposal.opponentTeamId))) return { error: "Not allowed." };

  if (!approve) {
    await db
      .update(matchProposals)
      .set({ status: "rejected", decidedBy: user.id, decidedAt: new Date() })
      .where(eq(matchProposals.id, proposalId));
    revalidatePath("/admin");
    return { ok: true };
  }

  const team = await db.query.teams.findFirst({
    where: eq(teams.id, proposal.teamId),
    columns: { slug: true },
  });
  const event = await eventFor(
    proposal.competition,
    proposal.teamId,
    proposal.proposedBy,
    proposal.playedOn,
  );
  const matchId = await writeMatch({
    eventId: event.id,
    teamId: proposal.teamId,
    opponentTeamId: proposal.opponentTeamId,
    opponentName: null,
    playedOn: proposal.playedOn,
    ourScore: proposal.ourScore,
    theirScore: proposal.theirScore,
    wasHome: proposal.wasHome,
    // The person who said it happened, not the one who agreed — a score is
    // attributed to whoever put it forward.
    byUserId: proposal.proposedBy,
  });

  await db
    .update(matchProposals)
    .set({ status: "approved", decidedBy: user.id, decidedAt: new Date(), matchId })
    .where(eq(matchProposals.id, proposalId));

  revalidatePath("/admin");
  if (team) revalidatePath(`/teams/${team.slug}`);
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
