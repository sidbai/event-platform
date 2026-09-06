import "server-only";

import { createHash } from "node:crypto";

import { and, eq, inArray, isNotNull } from "drizzle-orm";

import { db } from "@/db";
import { eventDivisions, eventTeams, events, matches, teams } from "@/db/schema";
import { uniqueTeamSlug } from "@/features/teams/slug";
import { zonedDate } from "@/lib/dates";
import { slugify } from "@/lib/slug";

import { nextSyncAt } from "./cadence";
import type { SyncedEvent } from "./provider";

/**
 * Writing a synced schedule into this application's own tables.
 *
 * Deliberately not a separate store. Divisions, teams and matches already
 * exist here with pages that render them, so a synced tournament gets the
 * schedule view, the standings table, the crests and the matchday navigation
 * for nothing — and a reader cannot tell which events we run and which we
 * only list, which is the entire point.
 */

/** A digest of what a platform published, so an unchanged fetch writes nothing. */
export function contentHash(data: SyncedEvent): string {
  // Sorted, because a platform reordering its rows is not a change. Without
  // this every poll would look different and rewrite the whole schedule.
  const shape = {
    teams: [...data.teams].sort((a, b) => a.sourceTeamId.localeCompare(b.sourceTeamId)),
    matches: [...data.matches].sort((a, b) =>
      a.sourceMatchId.localeCompare(b.sourceMatchId),
    ),
  };
  return createHash("sha256").update(JSON.stringify(shape)).digest("hex");
}

export type ApplyOutcome = {
  divisions: number;
  teams: number;
  matches: number;
  removed: number;
  unchanged: boolean;
};

/**
 * Bring one event's divisions, teams and matches into line with what its
 * platform currently publishes.
 *
 * Only ever touches rows a sync owns. Matches carry the platform's own id,
 * and a match without one was entered here by a person — an organizer who
 * claimed the event and started running it here — so it is never rewritten
 * or deleted by a connector.
 */
export async function applySync(
  eventId: string,
  data: SyncedEvent,
  now: Date,
  options: { prune?: boolean } = {},
): Promise<ApplyOutcome> {
  /*
   * A connector sees the whole event every time, so a fixture missing from
   * what it read has been cancelled. A person pasting one division at a time
   * has not cancelled the other thirty-three — pruning there would empty the
   * schedule with every paste.
   */
  const prune = options.prune ?? true;
  const event = await db.query.events.findFirst({
    where: eq(events.id, eventId),
    columns: { id: true, timezone: true, startsAt: true, endsAt: true, lastContentHash: true },
  });
  if (!event) throw new Error("event is gone");

  const hash = contentHash(data);
  if (event.lastContentHash === hash) {
    await db
      .update(events)
      .set({
        lastSyncedAt: now,
        lastSyncError: null,
        nextSyncAt: nextSyncAt(event, now),
      })
      .where(eq(events.id, eventId));
    return { divisions: 0, teams: 0, matches: 0, removed: 0, unchanged: true };
  }

  const tz = event.timezone ?? "America/Los_Angeles";

  // --- divisions, keyed by the name the platform prints -------------------
  const divisionNames = [...new Set(data.matches.map((m) => m.division))].filter(Boolean);
  const existingDivisions = await db.query.eventDivisions.findMany({
    where: eq(eventDivisions.eventId, eventId),
    columns: { id: true, name: true },
  });
  const divisionByName = new Map(existingDivisions.map((d) => [d.name, d.id]));

  for (const name of divisionNames) {
    if (divisionByName.has(name)) continue;
    const [row] = await db
      .insert(eventDivisions)
      .values({ eventId, name, birthYears: [] })
      .returning({ id: eventDivisions.id });
    divisionByName.set(name, row.id);
  }

  // --- teams -------------------------------------------------------------
  const existingEntries = await db.query.eventTeams.findMany({
    where: eq(eventTeams.eventId, eventId),
    columns: { id: true, teamId: true, sourceTeamId: true },
  });
  const entryBySource = new Map(
    existingEntries.filter((e) => e.sourceTeamId).map((e) => [e.sourceTeamId!, e]),
  );
  const teamIdBySource = new Map<string, string>();
  let teamsWritten = 0;

  for (const t of data.teams) {
    const known = entryBySource.get(t.sourceTeamId);
    if (known) {
      teamIdBySource.set(t.sourceTeamId, known.teamId);
      await db
        .update(eventTeams)
        .set({ divisionId: divisionByName.get(t.division) ?? null, groupLabel: t.group })
        .where(eq(eventTeams.id, known.id));
      continue;
    }

    // Private, because nobody has claimed it here. It exists so the schedule
    // has something to point at, not as a team page anyone is looking for.
    const team = await insertSyncedTeam(t.name, eventId);

    await db
      .insert(eventTeams)
      .values({
        eventId,
        teamId: team.id,
        divisionId: divisionByName.get(t.division) ?? null,
        groupLabel: t.group,
        sourceTeamId: t.sourceTeamId,
      })
      .onConflictDoNothing();

    teamIdBySource.set(t.sourceTeamId, team.id);
    teamsWritten++;
  }

  // --- matches -----------------------------------------------------------
  const synced = await db.query.matches.findMany({
    where: and(eq(matches.eventId, eventId), isNotNull(matches.sourceMatchId)),
    columns: { id: true, sourceMatchId: true },
  });
  const matchBySource = new Map(synced.map((m) => [m.sourceMatchId!, m.id]));
  const seen = new Set<string>();
  let matchesWritten = 0;

  for (const m of data.matches) {
    seen.add(m.sourceMatchId);
    const kickoffAt = m.date && m.time ? zonedDate(m.date, m.time, tz) : null;
    const values = {
      eventId,
      divisionId: divisionByName.get(m.division) ?? null,
      stage: "group" as const,
      groupLabel: m.group,
      field: m.field,
      kickoffAt,
      homeTeamId: m.homeTeamId ? (teamIdBySource.get(m.homeTeamId) ?? null) : null,
      awayTeamId: m.awayTeamId ? (teamIdBySource.get(m.awayTeamId) ?? null) : null,
      // The names as published, so a game whose team we could not match still
      // reads correctly rather than showing TBD against a real opponent.
      homePlaceholder: m.homeTeamId && teamIdBySource.has(m.homeTeamId) ? null : m.homeName,
      awayPlaceholder: m.awayTeamId && teamIdBySource.has(m.awayTeamId) ? null : m.awayName,
      homeScore: m.homeScore,
      awayScore: m.awayScore,
      status: (m.homeScore !== null ? "final" : "scheduled") as "final" | "scheduled",
      sourceMatchId: m.sourceMatchId,
    };

    const known = matchBySource.get(m.sourceMatchId);
    if (known) {
      await db.update(matches).set(values).where(eq(matches.id, known));
    } else {
      await db.insert(matches).values(values);
    }
    matchesWritten++;
  }

  // A fixture the platform no longer lists has been cancelled or renumbered.
  // Only ever synced rows: one entered by hand here is not ours to remove.
  const gone = prune
    ? synced.filter((m) => !seen.has(m.sourceMatchId!)).map((m) => m.id)
    : [];
  if (gone.length > 0) {
    await db.delete(matches).where(inArray(matches.id, gone));
  }

  await db
    .update(events)
    .set({
      lastSyncedAt: now,
      lastSyncError: null,
      lastContentHash: hash,
      nextSyncAt: nextSyncAt(event, now),
      updatedAt: now,
    })
    .where(eq(events.id, eventId));

  return {
    divisions: divisionNames.length,
    teams: teamsWritten,
    matches: matchesWritten,
    removed: gone.length,
    unchanged: false,
  };
}

/**
 * A team row for a name a platform published.
 *
 * Retried, because picking a free slug is a read followed by a write and two
 * syncs running at once will happily pick the same one — two tournaments in
 * the same weekend both fielding a "Leon FC U10" is not a rare case, it is
 * most weekends. The database has the unique constraint; this is what makes
 * losing that race cost a second attempt instead of a whole sync.
 */
async function insertSyncedTeam(name: string, eventId: string) {
  const base = slugify(name).slice(0, 60);
  for (let attempt = 0; ; attempt++) {
    try {
      const [team] = await db
        .insert(teams)
        .values({
          slug: await uniqueTeamSlug(base),
          name,
          visibility: "private",
          originEventId: eventId,
        })
        .returning({ id: teams.id });
      return team;
    } catch (error) {
      if (attempt >= 2 || !isUniqueViolation(error)) throw error;
    }
  }
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" && error !== null && "code" in error && error.code === "23505"
  );
}

/** Record a failed attempt without touching the schedule that is already there. */
export async function recordSyncFailure(
  eventId: string,
  detail: string,
  now: Date,
): Promise<void> {
  const event = await db.query.events.findFirst({
    where: eq(events.id, eventId),
    columns: { startsAt: true, endsAt: true },
  });
  await db
    .update(events)
    .set({
      lastSyncError: detail.slice(0, 500),
      // Still scheduled to retry: a platform being briefly unreachable is the
      // ordinary case, and giving up after one failure would be wrong.
      nextSyncAt: event ? nextSyncAt(event, now) : null,
    })
    .where(eq(events.id, eventId));
}
