"use server";

import { and, eq, isNotNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import {
  eventTeams,
  events,
  matches,
  matchStage,
  matchStatus,
  teams,
} from "@/db/schema";
import { getCurrentUser } from "@/features/auth";
import { canManageEvent } from "@/features/events/can-manage";
import { matchdayDates, roundRobin } from "./round-robin";
import { zonedDate } from "@/lib/dates";
import { uniqueTeamSlug } from "@/features/teams/slug";
import { slugify } from "@/lib/slug";

export type ScoreResult = { error?: string; ok?: boolean };

const STATUSES = new Set<string>(matchStatus.enumValues);

function parseScore(v: FormDataEntryValue | null): number | null | "bad" {
  const s = String(v ?? "").trim();
  if (s === "") return null;
  const n = Number(s);
  return Number.isInteger(n) && n >= 0 && n <= 99 ? n : "bad";
}

async function touchEvent(eventId: string, slug: string) {
  await db
    .update(events)
    .set({ updatedAt: new Date() })
    .where(eq(events.id, eventId));
  revalidatePath(`/events/${slug}`);
  revalidatePath(`/events/${slug}/scores`);
}

export async function saveMatch(
  eventSlug: string,
  matchId: string,
  _prev: ScoreResult,
  formData: FormData,
): Promise<ScoreResult> {
  if (!(await canManageEvent({ slug: eventSlug }))) return { error: "Not allowed." };

  const match = await db.query.matches.findFirst({
    where: eq(matches.id, matchId),
    with: { event: { columns: { slug: true } } },
  });
  if (!match || match.event.slug !== eventSlug) return { error: "Match not found." };

  const home = parseScore(formData.get("homeScore"));
  const away = parseScore(formData.get("awayScore"));
  if (home === "bad" || away === "bad") return { error: "Scores are whole numbers 0–99." };
  if ((home === null) !== (away === null)) return { error: "Enter both scores or neither." };

  /*
   * A shootout only decides a level game, and only one way. Both numbers or
   * neither, the same as the score; entered against a game that was not
   * level, or level itself, it is a typo rather than a result.
   */
  const homePens = parseScore(formData.get("homePens"));
  const awayPens = parseScore(formData.get("awayPens"));
  if (homePens === "bad" || awayPens === "bad") return { error: "Penalties are whole numbers 0–99." };
  if ((homePens === null) !== (awayPens === null)) return { error: "Enter both shootout scores or neither." };
  if (homePens !== null) {
    if (home === null || home !== away) return { error: "A shootout only decides a level game." };
    if (homePens === awayPens) return { error: "A shootout has a winner." };
  }

  const status = String(formData.get("status") ?? "scheduled");
  const homeTeamId = (formData.get("homeTeamId") as string) || null;
  const awayTeamId = (formData.get("awayTeamId") as string) || null;
  if (homeTeamId && awayTeamId && homeTeamId === awayTeamId) {
    return { error: "Home and away can't be the same team." };
  }

  /*
   * Marked as ours, so the next import does not write the source's blank
   * back over it.
   *
   * Only when a score is actually being set: clearing one is handing the
   * fixture back to the source, and leaving the mark there would freeze it
   * as permanently empty.
   */
  const user = await getCurrentUser();
  const mark =
    home === null
      ? { scoreSetBy: null, scoreSetAt: null }
      : { scoreSetBy: user?.id ?? null, scoreSetAt: new Date() };

  await db
    .update(matches)
    .set({
      homeScore: home,
      awayScore: away,
      homePens,
      awayPens,
      status: STATUSES.has(status)
        ? (status as (typeof matchStatus.enumValues)[number])
        : "scheduled",
      ...mark,
      ...(formData.has("homeTeamId") ? { homeTeamId } : {}),
      ...(formData.has("awayTeamId") ? { awayTeamId } : {}),
    })
    .where(eq(matches.id, matchId));

  await touchEvent(match.eventId, eventSlug);
  return { ok: true };
}

/**
 * Hand a fixture back to the organizer's data.
 *
 * The other half of setting a score by hand: a correction made from the
 * touchline, and then the organizer posts the real thing. Without this the
 * hand-set number wins forever and nobody can tell why the page disagrees
 * with the tournament's own site.
 *
 * It does not clear the score — the next import does that, or does not. This
 * only stops us holding the fixture against the source.
 */
export async function releaseMatchScore(
  eventSlug: string,
  matchId: string,
): Promise<void> {
  if (!(await canManageEvent({ slug: eventSlug }))) return;

  const match = await db.query.matches.findFirst({
    where: eq(matches.id, matchId),
    with: { event: { columns: { slug: true } } },
  });
  if (!match || match.event.slug !== eventSlug) return;

  await db
    .update(matches)
    .set({ scoreSetBy: null, scoreSetAt: null })
    .where(eq(matches.id, matchId));

  await touchEvent(match.eventId, eventSlug);
}

export async function addMatch(
  eventSlug: string,
  _prev: ScoreResult,
  formData: FormData,
): Promise<ScoreResult> {
  if (!(await canManageEvent({ slug: eventSlug }))) return { error: "Not allowed." };

  const event = await db.query.events.findFirst({
    where: eq(events.slug, eventSlug),
    columns: { id: true, startsAt: true, timezone: true },
  });
  if (!event) return { error: "Event not found." };

  const roundKey = String(formData.get("round") ?? "group");
  const stage: (typeof matchStage.enumValues)[number] =
    roundKey === "group" ? "group" : "ko";
  const groupLabel =
    roundKey === "group"
      ? String(formData.get("groupLabel") ?? "").trim() || null
      : null;

  const homeTeamId = (formData.get("homeTeamId") as string) || null;
  const awayTeamId = (formData.get("awayTeamId") as string) || null;
  if (homeTeamId && awayTeamId && homeTeamId === awayTeamId) {
    return { error: "Pick two different teams." };
  }

  const time = String(formData.get("time") ?? "").trim();
  const dateISO = event.startsAt
    ? new Intl.DateTimeFormat("en-CA", {
        timeZone: event.timezone ?? undefined,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(event.startsAt)
    : null;

  await db.insert(matches).values({
    eventId: event.id,
    divisionId: (formData.get("divisionId") as string) || null,
    stage,
    round: roundKey,
    groupLabel,
    field: String(formData.get("field") ?? "").trim() || null,
    kickoffAt: time && dateISO ? zonedDate(dateISO, time, event.timezone) : null,
    homeTeamId,
    awayTeamId,
    homePlaceholder: homeTeamId ? null : String(formData.get("homePlaceholder") ?? "").trim() || "TBD",
    awayPlaceholder: awayTeamId ? null : String(formData.get("awayPlaceholder") ?? "").trim() || "TBD",
    status: "scheduled",
  });

  await touchEvent(event.id, eventSlug);
  return { ok: true };
}

export async function addTeamToEvent(
  eventSlug: string,
  _prev: ScoreResult,
  formData: FormData,
): Promise<ScoreResult> {
  if (!(await canManageEvent({ slug: eventSlug }))) return { error: "Not allowed." };

  const event = await db.query.events.findFirst({
    where: eq(events.slug, eventSlug),
    columns: { id: true },
  });
  if (!event) return { error: "Event not found." };

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Team name?" };
  const divisionId = (formData.get("divisionId") as string) || null;
  const groupLabel = String(formData.get("groupLabel") ?? "").trim() || null;

  const slug = await uniqueTeamSlug(slugify(name).slice(0, 60));

  const [team] = await db
    .insert(teams)
    .values({
      slug,
      name,
      // Listed, like every other team: a side an organizer types onto the
      // scores page appears in that event's public table either way.
      visibility: "public",
      originEventId: event.id,
    })
    .returning({ id: teams.id });

  await db
    .insert(eventTeams)
    .values({ eventId: event.id, teamId: team.id, divisionId, groupLabel })
    .onConflictDoNothing();

  await touchEvent(event.id, eventSlug);
  return { ok: true };
}

export async function deleteMatch(
  eventSlug: string,
  matchId: string,
): Promise<void> {
  if (!(await canManageEvent({ slug: eventSlug }))) return;

  const match = await db.query.matches.findFirst({
    where: eq(matches.id, matchId),
    with: { event: { columns: { slug: true, id: true } } },
  });
  if (!match || match.event.slug !== eventSlug) return;

  await db.delete(matches).where(eq(matches.id, matchId));
  await touchEvent(match.event.id, eventSlug);
}


/**
 * Build a whole season of fixtures for one division at once.
 *
 * The alternative is what exists today: adding matches one at a time, which is
 * fine for a weekend tournament and hopeless for a league. A ten team division
 * playing everyone twice is ninety matches.
 *
 * Refuses to run when the division already has fixtures. Generating on top of
 * an existing schedule would silently double a season, and the fix afterwards
 * is deleting matches by hand — much worse than being told no.
 */
export async function generateFixtures(
  eventSlug: string,
  _prev: ScoreResult,
  formData: FormData,
): Promise<ScoreResult> {
  if (!(await canManageEvent({ slug: eventSlug }))) return { error: "Not allowed." };

  const event = await db.query.events.findFirst({
    where: eq(events.slug, eventSlug),
    columns: { id: true, timezone: true },
  });
  if (!event) return { error: "Event not found." };

  const divisionId = String(formData.get("divisionId") ?? "");
  if (!divisionId) return { error: "Pick a division." };

  const startISO = String(formData.get("startDate") ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startISO)) {
    return { error: "Give a first matchday, as a date." };
  }

  const time = String(formData.get("time") ?? "").trim() || "09:00";
  const everyDays = Number(formData.get("everyDays") ?? 7);
  if (!Number.isInteger(everyDays) || everyDays < 1 || everyDays > 60) {
    return { error: "Rounds should be between 1 and 60 days apart." };
  }
  const legs = String(formData.get("legs") ?? "1") === "2" ? 2 : 1;

  // Only group games count as "already generated". An organizer who pencils
  // in the final at 3pm before drawing the group stage is doing something
  // sensible, and blocking them because the division has *a* match confuses
  // "this season already exists" with "this division has a fixture".
  const existing = await db.query.matches.findFirst({
    where: and(
      eq(matches.eventId, event.id),
      eq(matches.divisionId, divisionId),
      eq(matches.stage, "group"),
    ),
    columns: { id: true },
  });
  if (existing) {
    return {
      error:
        "That division already has fixtures. Delete them first if you want to rebuild the season.",
    };
  }

  const entered = await db.query.eventTeams.findMany({
    where: and(
      eq(eventTeams.eventId, event.id),
      eq(eventTeams.divisionId, divisionId),
    ),
    columns: { teamId: true, groupLabel: true },
  });
  if (entered.length < 2) {
    return { error: "That division needs at least two teams." };
  }

  /*
   * Brackets are scheduled separately, because a bracket is a group that plays
   * itself — pairing across brackets would produce fixtures that count toward
   * neither table.
   */
  const byBracket = new Map<string, string[]>();
  for (const t of entered) {
    const key = t.groupLabel ?? "";
    byBracket.set(key, [...(byBracket.get(key) ?? []), t.teamId]);
  }

  const rows: (typeof matches.$inferInsert)[] = [];
  for (const [bracket, teamIds] of byBracket) {
    const rounds = roundRobin(teamIds, legs);
    const dates = matchdayDates(startISO, rounds.length, everyDays);
    for (const [i, round] of rounds.entries()) {
      for (const p of round.pairings) {
        rows.push({
          eventId: event.id,
          divisionId,
          stage: "group",
          /*
           * Both: the number is what the schedule groups and orders by, and
           * the text stays because it is what has been written since this
           * generator existed and something may yet be reading it.
           */
          week: round.round,
          round: `round-${round.round}`,
          groupLabel: bracket || null,
          kickoffAt: zonedDate(dates[i], time, event.timezone),
          homeTeamId: p.homeTeamId,
          awayTeamId: p.awayTeamId,
          status: "scheduled",
        });
      }
    }
  }

  if (rows.length === 0) return { error: "Nothing to schedule." };
  await db.insert(matches).values(rows);

  await touchEvent(event.id, eventSlug);
  revalidatePath(`/events/${eventSlug}/table`);
  return { ok: true };
}

/**
 * Put a team in a bracket, or take it out of one.
 *
 * A tournament division is usually several groups that each play themselves —
 * the King Juan Cup runs two groups of four per age band — and until now the
 * only way to set a team's group was to type the team in by hand on this page.
 * A team that arrived the proper way, by entering and being accepted, had no
 * group and no way to be given one, so a division of eight generated one
 * round-robin of 28 games instead of two of six.
 *
 * Blank clears it, which is what a division with no groups wants.
 */
export async function setTeamGroup(
  eventSlug: string,
  eventTeamId: string,
  _prev: ScoreResult,
  formData: FormData,
): Promise<ScoreResult> {
  if (!(await canManageEvent({ slug: eventSlug }))) return { error: "Not allowed." };

  const event = await db.query.events.findFirst({
    where: eq(events.slug, eventSlug),
    columns: { id: true },
  });
  if (!event) return { error: "Event not found." };

  const label = String(formData.get("groupLabel") ?? "").trim().slice(0, 12);

  await db
    .update(eventTeams)
    .set({ groupLabel: label || null })
    // Scoped to the event as well as the row, so an id from one event cannot
    // be driven from another event's page.
    .where(and(eq(eventTeams.id, eventTeamId), eq(eventTeams.eventId, event.id)));

  await touchEvent(event.id, eventSlug);
  return { ok: true };
}

/**
 * Delete every fixture in a division.
 *
 * Generating a season is one click and refuses to run twice; undoing it was
 * twenty-eight. An organizer who generates before splitting the teams into
 * groups — which is the easy mistake, since the groups have to be set first
 * for it to come out right — otherwise has no way back.
 *
 * Refuses once anything has been played. A schedule with results in it is not
 * a mistake to undo, and rebuilding it would throw away the scores.
 */
export async function clearFixtures(
  eventSlug: string,
  divisionId: string,
): Promise<ScoreResult> {
  if (!(await canManageEvent({ slug: eventSlug }))) return { error: "Not allowed." };

  const event = await db.query.events.findFirst({
    where: eq(events.slug, eventSlug),
    columns: { id: true },
  });
  if (!event) return { error: "Event not found." };

  const played = await db.query.matches.findFirst({
    where: and(
      eq(matches.eventId, event.id),
      eq(matches.divisionId, divisionId),
      isNotNull(matches.homeScore),
    ),
    columns: { id: true },
  });
  if (played) {
    return { error: "Some of these games have scores. Delete those individually." };
  }

  await db
    .delete(matches)
    .where(and(eq(matches.eventId, event.id), eq(matches.divisionId, divisionId)));

  await touchEvent(event.id, eventSlug);
  return { ok: true };
}
