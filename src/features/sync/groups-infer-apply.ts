import "server-only";

import { and, asc, eq, inArray, isNull } from "drizzle-orm";

import { db } from "@/db";
import { eventDivisions, eventTeams, matches, teams } from "@/db/schema";

import { inferGroups } from "./group-inference";

/**
 * Groups for every division of an event, read off the schedule and written.
 *
 * Runs after a pasted schedule lands, so a tournament from a platform whose
 * fixture rows never say the group still shows its groups where the shape
 * of the games gives them away — and says which divisions it could not
 * read, so the person knows which standings pages to copy. The script
 * `db:groups:infer` is the same function run by hand.
 *
 * Only divisions with no label on any game: a label a person or a paste put
 * there is theirs. A showcase has no groups to find and is not reported as
 * a failure to find them.
 */

export type DivisionGroups = {
  divisionId: string;
  division: string;
  outcome: "grouped" | "single" | "showcase" | "unclear" | "already";
  note: string;
  /** Team names per group, lettered A, B, …, where grouped. */
  groups: string[][];
  /** "Final: X v Y", "Placement: …" — the cross-group games, in order. */
  extras: string[];
};

export type GroupsOutcome = {
  divisions: DivisionGroups[];
  gamesLabelled: number;
  entriesLabelled: number;
};

const LETTERS = "ABCDEFGH";

export async function inferGroupsForEvent(
  eventId: string,
  options: { apply: boolean } = { apply: false },
): Promise<GroupsOutcome> {
  const divisions = await db
    .select({ id: eventDivisions.id, name: eventDivisions.name })
    .from(eventDivisions)
    .where(eq(eventDivisions.eventId, eventId))
    .orderBy(asc(eventDivisions.name));
  const teamNames = new Map(
    (await db.select({ id: teams.id, name: teams.name }).from(teams)).map((t) => [t.id, t.name]),
  );

  const out: GroupsOutcome = { divisions: [], gamesLabelled: 0, entriesLabelled: 0 };

  for (const division of divisions) {
    const games = await db
      .select({
        id: matches.id,
        home: matches.homeTeamId,
        away: matches.awayTeamId,
        homePh: matches.homePlaceholder,
        awayPh: matches.awayPlaceholder,
        at: matches.kickoffAt,
        groupLabel: matches.groupLabel,
      })
      .from(matches)
      .where(eq(matches.divisionId, division.id))
      .orderBy(asc(matches.kickoffAt));
    if (games.length === 0) continue;

    const row: DivisionGroups = {
      divisionId: division.id,
      division: division.name,
      outcome: "single",
      note: "",
      groups: [],
      extras: [],
    };
    out.divisions.push(row);

    if (games.some((g) => g.groupLabel)) {
      row.outcome = "already";
      row.note = "already grouped — left alone";
      continue;
    }
    if (/showcase/i.test(division.name)) {
      row.outcome = "showcase";
      row.note = "a showcase has no groups";
      continue;
    }

    const fixtures = games.map((g) => ({
      id: g.id,
      home: g.home ?? `ph:${g.homePh ?? "?"}`,
      away: g.away ?? `ph:${g.awayPh ?? "?"}`,
      at: g.at ? g.at.getTime() : null,
    }));
    const read = inferGroups(fixtures);
    const label = (key: string) => (key.startsWith("ph:") ? key.slice(3) : (teamNames.get(key) ?? key));
    if (!read.ok) {
      row.outcome = "unclear";
      row.note = read.reason;
      continue;
    }
    row.note = read.note;
    if (read.groups.length === 1 && read.labels.size === 0) {
      row.note = "one round robin, nothing to label";
      continue;
    }
    row.outcome = read.groups.length > 1 ? "grouped" : "single";
    row.groups = read.groups.length > 1 ? read.groups.map((g) => g.map(label)) : [];
    for (const [id, l] of read.labels) {
      if (l === "Final" || l === "Placement") {
        const g = fixtures.find((f) => f.id === id)!;
        row.extras.push(`${l}: ${label(g.home)} v ${label(g.away)}`);
      }
    }
    if (!options.apply) continue;

    for (const [id, l] of read.labels) {
      await db
        .update(matches)
        .set({ groupLabel: l })
        .where(and(eq(matches.id, id), isNull(matches.groupLabel)));
      out.gamesLabelled++;
    }
    if (read.groups.length > 1) {
      for (const [i, g] of read.groups.entries()) {
        const ids = g.filter((k) => !k.startsWith("ph:"));
        if (ids.length === 0) continue;
        const done = await db
          .update(eventTeams)
          .set({ groupLabel: LETTERS[i] })
          .where(
            and(
              eq(eventTeams.eventId, eventId),
              eq(eventTeams.divisionId, division.id),
              inArray(eventTeams.teamId, ids),
              isNull(eventTeams.groupLabel),
            ),
          )
          .returning({ id: eventTeams.id });
        out.entriesLabelled += done.length;
      }
    }
  }
  return out;
}

/** One line for a paste result or a script summary. */
export function describeGroups(outcome: GroupsOutcome): string {
  const n = (k: DivisionGroups["outcome"]) => outcome.divisions.filter((d) => d.outcome === k).length;
  const grouped = n("grouped");
  const unclear = n("unclear");
  const bits: string[] = [];
  if (grouped > 0) bits.push(`${grouped} division${grouped === 1 ? "" : "s"} put into groups`);
  if (unclear > 0) {
    bits.push(
      `${unclear} division${unclear === 1 ? "" : "s"} whose groups the schedule cannot show — copy their standings page`,
    );
  }
  return bits.join("; ");
}
