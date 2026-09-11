import "server-only";

import { createHash } from "node:crypto";

import { and, eq, inArray, isNotNull } from "drizzle-orm";

import { db } from "@/db";
import {
  clubAliases,
  clubs,
  eventDivisions,
  eventTeams,
  events,
  matches,
  teamAliases,
  teams,
} from "@/db/schema";
import { clubIndex, matchClub, type ClubMatch } from "@/features/clubs/matching";
import { teamFactsFrom, type TeamFacts } from "@/features/teams/facts";

import { writtenName } from "./planned-team";
import { teamToBindTo } from "@/features/teams/binding";
import { normaliseTeamName } from "@/features/teams/merge-plan";
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

/**
 * Bump when this file starts turning the same fetch into different rows.
 *
 * The digest below is of what the platform published, which is the right
 * question for "has anything changed over there" and the wrong one for "would
 * we write this differently now". Those came apart twice: a fix that kept the
 * date of a fixture whose time is not set would have left three and a half
 * thousand of them null forever, because the source had not changed and every
 * poll answered "unchanged" — and a reset needed the digest cleared by hand
 * for the same reason.
 *
 * So the version goes into the digest. Change how a fetch becomes rows, bump
 * this, and the next poll of every event writes once and settles.
 *
 * 2 — a date with no time keeps its date (2026-09-10)
 * 3 — the venue a platform names beside the field is kept (2026-09-11)
 */
const WRITE_VERSION = 3;

/** A digest of what a platform published, so an unchanged fetch writes nothing. */
export function contentHash(data: SyncedEvent): string {
  // Sorted, because a platform reordering its rows is not a change. Without
  // this every poll would look different and rewrite the whole schedule.
  const shape = {
    v: WRITE_VERSION,
    teams: [...data.teams].sort((a, b) => a.sourceTeamId.localeCompare(b.sourceTeamId)),
    matches: [...data.matches].sort((a, b) =>
      a.sourceMatchId.localeCompare(b.sourceMatchId),
    ),
  };
  return createHash("sha256").update(JSON.stringify(shape)).digest("hex");
}

/**
 * Below this many fixtures an event is too small for the shape of a loss to
 * mean anything, and above this share of them a loss is ordinary pruning.
 *
 * Half is deliberately far from the edge. The failure it catches took
 * seventy-three per cent of a league in one sync; a season that genuinely
 * halves between two polls is not something anybody here has seen.
 */
const COLLAPSE_FLOOR = 20;
const COLLAPSE_SHARE = 0.5;

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
    // status among them: a completed event stops being polled, and the
    // cadence is the one place that decides when to look again.
    columns: {
      id: true,
      timezone: true,
      startsAt: true,
      endsAt: true,
      status: true,
      lastContentHash: true,
    },
  });
  if (!event) throw new Error("event is gone");

  const hash = contentHash(data);
  if (event.lastContentHash === hash) {
    await db
      .update(events)
      .set({
        lastSyncedAt: now,
        lastSyncError: null,
        nextSyncAt: nextSyncAt(
          { ...event, kickoffs: await kickoffsFor(eventId) },
          now,
        ),
      })
      .where(eq(events.id, eventId));
    return { divisions: 0, teams: 0, matches: 0, removed: 0, unchanged: true };
  }

  /*
   * A read that would delete most of a schedule is a read that went wrong.
   *
   * Imperva served the Regional Club League's boys accepted-teams page as a
   * challenge — 200, eighty kilobytes, no flights — and the connector read
   * that as an age group with no teams, kept going with the girls half, and
   * this function deleted three thousand one hundred and twenty-nine
   * fixtures. Nothing errored. The admin screen said it had synced.
   *
   * A league does not lose half its season between two Mondays. A connector
   * that thinks it has is a connector that could not see, so nothing is
   * written and the error stands where somebody will read it — and the next
   * poll tries again, which is what fixes it when the block lifts.
   *
   * Small events are exempt: a five-fixture friendly losing three is a real
   * thing an organizer does, and there is no signal in it either way.
   */
  const held = await db.$count(
    matches,
    and(eq(matches.eventId, eventId), isNotNull(matches.sourceMatchId)),
  );
  if (prune && held >= COLLAPSE_FLOOR && data.matches.length < held * COLLAPSE_SHARE) {
    throw new Error(
      `refusing to shrink this event from ${held} fixtures to ${data.matches.length} — ` +
        `a read that small is usually a page that did not arrive`,
    );
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

  /*
   * The directory, for filing a team under its club as it is created.
   *
   * Loaded once per sync rather than per team: this is forty rows, and the
   * alternative is a query inside a loop that runs three hundred times for a
   * club tournament.
   */
  const clubRows = await db
    .select({ id: clubs.id, name: clubs.name, slug: clubs.slug, shortName: clubs.shortName })
    .from(clubs);
  const aliasRows = await db
    .select({ alias: clubAliases.alias, clubId: clubAliases.clubId })
    .from(clubAliases);
  const clubIdx = clubIndex(clubRows);
  const aliasMap = new Map(aliasRows.map((r) => [r.alias, r.clubId]));
  const aliasesByClub = new Map<string, string[]>();
  for (const row of aliasRows) {
    aliasesByClub.set(row.clubId, [...(aliasesByClub.get(row.clubId) ?? []), row.alias]);
  }
  const clubsById = new Map(
    clubRows.map((c) => [c.id, { ...c, aliases: aliasesByClub.get(c.id) ?? [] }]),
  );

  /*
   * Names an admin has already said belong to an existing team.
   *
   * Written when they merge two rows, so a question answered once is not
   * asked every tournament: a platform that called a side "Little Warriors
   * B15 B" this September will call it that next September too. Without this
   * the connector mints a new row each time and the queue refills.
   */
  const teamAliasRows = await db
    .select({ alias: teamAliases.alias, teamId: teamAliases.teamId })
    .from(teamAliases);
  const teamByAlias = new Map(teamAliasRows.map((r) => [r.alias, r.teamId]));

  /*
   * Every team already here, for attaching a name we have seen before.
   *
   * Without this a new tournament mints a fresh row for every side, including
   * the hundred already here from last month, and the queue asks somebody to
   * put back together what the import just split — 177 of the 191 pairs
   * waiting in it were exactly that.
   */
  const teamRows = await db
    .select({
      id: teams.id,
      name: teams.name,
      clubId: teams.clubId,
      gender: teams.gender,
      birthYears: teams.birthYears,
      tier: teams.tier,
    })
    .from(teams);

  /*
   * Every name any event has published for a team, alongside its own.
   *
   * A side is named four ways across four tournaments, and the fifth
   * tournament may use the second one. Matching only against what the team is
   * called here would mint a new row for a name we have already seen and
   * already bound — so a published name counts as much as the current one,
   * carrying that team's facts with it.
   */
  const factsById = new Map(teamRows.map((t) => [t.id, t]));
  const published = await db
    .selectDistinct({ teamId: eventTeams.teamId, sourceName: eventTeams.sourceName })
    .from(eventTeams)
    .where(isNotNull(eventTeams.sourceName));

  const existingTeams = [
    ...teamRows,
    ...published.flatMap((p) => {
      const facts = factsById.get(p.teamId);
      return facts && p.sourceName ? [{ ...facts, name: p.sourceName }] : [];
    }),
  ];

  const existingEntries = await db.query.eventTeams.findMany({
    where: eq(eventTeams.eventId, eventId),
    columns: { id: true, teamId: true, sourceTeamId: true },
  });
  const entryBySource = new Map(
    existingEntries.filter((e) => e.sourceTeamId).map((e) => [e.sourceTeamId!, e]),
  );
  const teamIdBySource = new Map<string, string>();
  let teamsWritten = 0;

  /*
   * A fact we did not have and the source states.
   *
   * Only ever null → known: the team's own row is the authority once it has
   * one, and a platform that changes its mind does not get to overwrite what
   * somebody here established. This exists because eighty-three Elite
   * Academy teams were written before their connector passed the gender
   * along, and every one of them fell back to its published name — seven
   * ages of a club all called "Harbor SC". Filling it in here is what lets
   * db:teams:rename put them right without a backfill of its own.
   */
  async function noteGender(teamId: string, stated: TeamFacts["gender"]) {
    if (!stated) return;
    const known = factsById.get(teamId);
    if (!known || known.gender) return;
    await db.update(teams).set({ gender: stated }).where(eq(teams.id, teamId));
    factsById.set(teamId, { ...known, gender: stated });
  }

  for (const t of data.teams) {
    const known = entryBySource.get(t.sourceTeamId);
    if (known) {
      teamIdBySource.set(t.sourceTeamId, known.teamId);
      await noteGender(known.teamId, t.gender ?? null);
      await db
        .update(eventTeams)
        .set({
          divisionId: divisionByName.get(t.division) ?? null,
          groupLabel: t.group,
          sourceName: t.name,
        })
        .where(eq(eventTeams.id, known.id));
      continue;
    }

    /*
     * A name somebody has already bound to a team wins over making another.
     *
     * This is the merge queue paying for itself: the admin answered once,
     * and every future import of that name lands on the same team instead of
     * a row for them to fold in again.
     */
    const facts = teamFactsFrom(t.name, {
      seasonStart: event.startsAt,
      clubSlug: null,
      // The flight the platform entered them in, which names a gender and an
      // age group even when the team's own name says neither.
      division: t.division,
      // And where the flight does not either — Modular11 puts it in a column.
      gender: t.gender ?? null,
    });
    const club = matchClub(t.name, aliasMap, clubIdx);

    /*
     * An alias somebody wrote, or a team whose name and facts already match.
     *
     * The alias is a decision; the binding is a rule, and a stricter one than
     * the queue's — the name must match exactly, nothing may contradict, and
     * some fact must positively agree. Two bare "Warriors" rows agree about
     * nothing and are left to a person, which is the case this must not take.
     */
    const bound =
      teamByAlias.get(normaliseTeamName(t.name)) ??
      teamToBindTo(
        {
          id: "incoming",
          name: t.name,
          clubId: club?.clubId ?? null,
          gender: facts.gender,
          birthYears: facts.birthYears,
          tier: facts.tier,
        },
        existingTeams,
      )?.id;

    if (bound) {
      teamIdBySource.set(t.sourceTeamId, bound);
      await noteGender(bound, facts.gender);
      await db
        .insert(eventTeams)
        .values({
          eventId,
          teamId: bound,
          divisionId: divisionByName.get(t.division) ?? null,
          groupLabel: t.group,
          sourceTeamId: t.sourceTeamId,
          // What this event calls it, which may not be what the team is
          // called here — that is the whole reason to keep it.
          sourceName: t.name,
        })
        .onConflictDoNothing();
      continue;
    }

    // Private, because nobody has claimed it here. It exists so the schedule
    // has something to point at, not as a team page anyone is looking for.
    const team = await insertSyncedTeam(t.name, eventId, {
      seasonStart: event.startsAt,
      club,
      clubsById,
      division: t.division,
      gender: t.gender ?? null,
    });
    // Bindable from here on, so a name repeated later in this same feed
    // lands on the row just made rather than another copy of it.
    existingTeams.push({
      id: team.id,
      name: t.name,
      clubId: club?.clubId ?? null,
      gender: facts.gender,
      birthYears: facts.birthYears,
      tier: facts.tier,
    });

    await db
      .insert(eventTeams)
      .values({
        eventId,
        teamId: team.id,
        divisionId: divisionByName.get(t.division) ?? null,
        groupLabel: t.group,
        sourceTeamId: t.sourceTeamId,
        sourceName: t.name,
      })
      .onConflictDoNothing();

    teamIdBySource.set(t.sourceTeamId, team.id);
    teamsWritten++;
  }

  // --- matches -----------------------------------------------------------
  const synced = await db.query.matches.findMany({
    where: and(eq(matches.eventId, eventId), isNotNull(matches.sourceMatchId)),
    columns: { id: true, sourceMatchId: true, scoreSetAt: true },
  });
  const matchBySource = new Map(synced.map((m) => [m.sourceMatchId!, m]));
  const seen = new Set<string>();
  let matchesWritten = 0;

  for (const m of data.matches) {
    seen.add(m.sourceMatchId);
    /*
     * A date with no time is still a date.
     *
     * This wanted both, so a fixture published before its fields are booked
     * lost the day as well as the hour — 3,549 of the Regional Club League's
     * 4,275, which is most of a season a parent could otherwise plan around.
     *
     * Midnight is how that is said here, and has been since before this:
     * timeAnnounced exists to read it back, and everything that prints a
     * kick-off already says "time TBD" rather than "12:00 AM". What has no
     * date at all still gets nothing, because that is a different fact.
     */
    const kickoffAt = m.date ? zonedDate(m.date, m.time ?? "00:00", tz) : null;
    const values = {
      eventId,
      divisionId: divisionByName.get(m.division) ?? null,
      stage: "group" as const,
      groupLabel: m.group,
      field: m.field,
      venue: m.venue,
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
      /*
       * A score somebody set here is not overwritten by the source's.
       *
       * The final of a tournament is the game most likely to be missing from
       * a platform — both teams walked off knowing it, and nobody went back
       * to type it in — so it is the one an admin fills in by hand. Taking
       * the source's blank over it on the next import would undo that
       * silently, and the only visible sign would be a champion who stopped
       * being one.
       *
       * Everything else about the fixture still updates: a moved kick-off, a
       * changed field, a team we can now match are all the source's to say.
       */
      const keepScore = known.scoreSetAt !== null;
      await db
        .update(matches)
        .set(
          keepScore
            ? // Everything the source is still entitled to say.
              {
                eventId: values.eventId,
                divisionId: values.divisionId,
                stage: values.stage,
                groupLabel: values.groupLabel,
                field: values.field,
                venue: values.venue,
                kickoffAt: values.kickoffAt,
                homeTeamId: values.homeTeamId,
                awayTeamId: values.awayTeamId,
                homePlaceholder: values.homePlaceholder,
                awayPlaceholder: values.awayPlaceholder,
                sourceMatchId: values.sourceMatchId,
              }
            : values,
        )
        .where(eq(matches.id, known.id));
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
      // After the writes above, so a season that has just had its fixtures
      // published is asked again on their schedule and not on yesterday's.
      nextSyncAt: nextSyncAt({ ...event, kickoffs: await kickoffsFor(eventId) }, now),
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
 * When this event's games kick off, for the cadence.
 *
 * Only a season needs them — a weekend is being played for the whole of its
 * span and asks nothing — but they are cheap to fetch either way and the rule
 * reads better for being handed everything it might use. Indexed on event_id.
 */
async function kickoffsFor(eventId: string): Promise<(Date | null)[]> {
  const rows = await db.query.matches.findMany({
    where: eq(matches.eventId, eventId),
    columns: { kickoffAt: true },
  });
  return rows.map((r) => r.kickoffAt);
}

/**
 * A team row for a name a platform published, under the name we write.
 *
 * Retried, because picking a free slug is a read followed by a write and two
 * syncs running at once will happily pick the same one — two tournaments in
 * the same weekend both fielding a "Leon FC U10" is not a rare case, it is
 * most weekends. The database has the unique constraint; this is what makes
 * losing that race cost a second attempt instead of a whole sync.
 */
async function insertSyncedTeam(
  name: string,
  eventId: string,
  context: {
    seasonStart: Date | null;
    club: ClubMatch | null;
    clubsById: Map<
      string,
      { name: string; slug: string; shortName: string | null; aliases: string[] }
    >;
    division?: string | null;
    gender?: TeamFacts["gender"];
  },
) {

  /*
   * What the name says, recorded as the row is written.
   *
   * These used to arrive only from backfill scripts, so a team imported
   * after the last run had no club, no birth years and no gender — and the
   * duplicate finder, which matches on exactly those, had nothing to work
   * with for the newest rows. The facts belong where the row is made.
   */
  const clubId = context.club?.clubId ?? null;
  const club = clubId ? (context.clubsById.get(clubId) ?? null) : null;
  const facts = teamFactsFrom(name, {
    seasonStart: context.seasonStart,
    clubSlug: club?.slug ?? null,
    division: context.division,
    gender: context.gender ?? null,
  });

  /*
   * Written the one way from the start, rather than left for a script.
   *
   * The published name is not lost by this — event_teams.source_name keeps
   * what this event called the side, and the binder above matches against
   * every source name any event has used, so the next tournament to print
   * "XF BU14 ECNL 1" still lands on this row. Only a club's teams: a side
   * with no club has nothing to normalise against and keeps its name.
   */
  const written = writtenName(name, club && { id: clubId!, ...club }, facts);
  const base = slugify(written).slice(0, 60);

  for (let attempt = 0; ; attempt++) {
    try {
      const [team] = await db
        .insert(teams)
        .values({
          slug: await uniqueTeamSlug(base),
          name: written,
          // Listed, like every other team. This used to be "private", meaning
          // "we did not put it here on purpose" rather than "keep it secret",
          // and the two readings needed a special case in every query that
          // touched a team. A side whose name is already on a public
          // standings page is not a secret.
          visibility: "public",
          originEventId: eventId,
          ...facts,
          // affiliation and club_id are one fact in two columns; the CHECK
          // constraint refuses either without the other.
          ...(clubId ? { clubId, affiliation: "club" as const } : {}),
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
    columns: { startsAt: true, endsAt: true, status: true },
  });
  await db
    .update(events)
    .set({
      lastSyncError: detail.slice(0, 500),
      // Still scheduled to retry: a platform being briefly unreachable is the
      // ordinary case, and giving up after one failure would be wrong. On the
      // season's own schedule, so a league that is unreachable in February is
      // retried tomorrow rather than three times an hour until March.
      nextSyncAt: event
        ? nextSyncAt({ ...event, kickoffs: await kickoffsFor(eventId) }, now)
        : null,
    })
    .where(eq(events.id, eventId));
}
