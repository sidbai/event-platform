/**
 * Whether a team won a tournament, worked out from the final itself.
 *
 * Three platforms say "this was the final" three ways, and the answer must
 * not depend on which one published the schedule:
 *
 *  - an event run here writes a knockout stage and a round;
 *  - Athletes2Events writes "Final" in the same field it uses for
 *    "Semi-Finals A" and "Gold 2";
 *  - EventConnect puts the knockout round in its own DIVISION, named
 *    "Boys U12 Championships" beside the group divisions "Boys U12 Red" and
 *    "Boys U12 Silver". Every game in it is the final of one flight.
 *
 * Derived rather than stored, because a stored placing is a second thing to
 * keep true: a score corrected the day after would leave a team credited
 * with a trophy the results no longer support. The final is the record.
 *
 * Deliberately silent when it cannot tell. A final with no score is a game
 * not played yet, and one that ended level was decided by penalties — held
 * only when somebody entered the shootout by hand, and unsaid otherwise. A
 * page claiming the wrong champion is worse than a page saying nothing.
 */

import { winner } from "@/features/events/score-label";

export type FinalLike = {
  /** 'group' | 'ko', for events this platform runs. */
  stage: string | null;
  /** 'final' | 'semi' | …, alongside stage. */
  round: string | null;
  /** The organizer's own label, which is where an import puts it. */
  groupLabel: string | null;
  /** The division this game sits in, which is where EventConnect puts it. */
  divisionId: string | null;
  division: { name: string } | null;
  homeTeamId: string | null;
  awayTeamId: string | null;
  homeScore: number | null;
  awayScore: number | null;
  /** The shootout, where a final ended level and somebody wrote it down. */
  homePens?: number | null;
  awayPens?: number | null;
};

export type Place = "champion" | "runner-up";

/**
 * A final, however the source says so.
 *
 * Anchored on purpose: "Semi-Finals A" contains the word and is not one, and
 * a team knocked out in the semi-final has not come second.
 */
export function isFinal(match: Pick<FinalLike, "stage" | "round" | "groupLabel">): boolean {
  if (match.stage === "ko" && match.round?.toLowerCase() === "final") return true;
  return /^finals?$/i.test((match.groupLabel ?? "").trim());
}

/**
 * A division that holds knockout games rather than a group.
 *
 * "Boys U12 Championships" sits beside "Boys U12 Red" and holds one final per
 * flight — 124 such divisions across seven imported events, and in every one
 * of them no team plays twice.
 *
 * Which is the check that keeps this honest: a name is a weak signal, so a
 * team credited on it must have played exactly ONE game there. A tournament
 * that named its group stage "Championship Division" would otherwise hand a
 * trophy to whoever won their last group game.
 */
export function isKnockoutDivision(name: string | null | undefined): boolean {
  return /championship/i.test(name ?? "");
}

/** Where this team finished in that final, or null if it cannot be said. */
export function placeIn(match: FinalLike, teamId: string): Place | null {
  if (!isFinal(match)) return null;
  // A level final was settled by penalties; without the shootout written
  // down there is no saying by whom.
  const won = winner(match);
  if (!won) return null;

  const homeWon = won === "home";
  if (match.homeTeamId === teamId) return homeWon ? "champion" : "runner-up";
  if (match.awayTeamId === teamId) return homeWon ? "runner-up" : "champion";
  return null;
}

/**
 * The top of a round robin, where the table is the record.
 *
 * Plenty of youth tournaments have no final: a "Gold" flight of six plays
 * each other over a weekend and whoever tops the table takes the trophy.
 * Eastside FC's U11 girls went 4–0 in the Rainier Challenge's A-Gold and
 * the page said nothing, because nothing was labelled a final.
 *
 * Said only when it can be said. Every game in the division decided, at
 * least three teams, and the leader clear on points alone — tiebreakers
 * differ by organizer (head-to-head here, goal difference there), so a tie
 * on points is not resolved, it is declined. The runner-up likewise: clear
 * of third and clearly behind first, or unsaid.
 *
 * Which divisions are handed in is the caller's decision; this only reads a
 * table, it does not know what kind of event it belongs to.
 */
export function tableChampion<T extends FinalLike>(
  division: T[],
): { champion: string; runnerUp: string | null } | null {
  if (division.length < 3) return null;
  if (division.some((m) => isFinal(m) || isKnockoutDivision(m.division?.name))) return null;
  if (division.some((m) => m.homeScore === null || m.awayScore === null)) return null;

  const points = new Map<string, number>();
  const add = (id: string | null, n: number) => {
    if (id) points.set(id, (points.get(id) ?? 0) + n);
  };
  for (const m of division) {
    // A placeholder side is a table nobody can read.
    if (!m.homeTeamId || !m.awayTeamId) return null;
    const home = m.homeScore!;
    const away = m.awayScore!;
    add(m.homeTeamId, home > away ? 3 : home === away ? 1 : 0);
    add(m.awayTeamId, away > home ? 3 : home === away ? 1 : 0);
  }
  if (points.size < 3) return null;

  const table = [...points].sort((a, b) => b[1] - a[1]);
  const [first, second, third] = table;
  if (first[1] === second[1]) return null;
  const runnerUp = third === undefined || second[1] > third[1] ? second[0] : null;
  return { champion: first[0], runnerUp };
}

/**
 * What a team won, keyed by the event it won it at.
 *
 * One entry per event rather than per division: a team plays in one division
 * of one tournament, and the event is what a reader recognises.
 *
 * `tables` are whole divisions — every game, not just this team's — for the
 * events whose table decides the title. Their finals, where they have one,
 * are read the same way as the team's own; where they have none, the table
 * is read instead.
 */
export function honoursByEvent<T extends FinalLike & { eventId: string }>(
  matches: T[],
  teamId: string,
  tables: T[] = [],
): Map<string, Place> {
  /*
   * How many decided games the team played in each division.
   *
   * One is what a knockout round looks like from a single team's side; more
   * than one is a group, whatever the division happens to be called.
   */
  const played = new Map<string, number>();
  for (const match of matches) {
    if (match.homeScore === null || match.awayScore === null) continue;
    if (match.homeTeamId !== teamId && match.awayTeamId !== teamId) continue;
    const key = match.divisionId ?? "";
    played.set(key, (played.get(key) ?? 0) + 1);
  }

  const out = new Map<string, Place>();
  for (const match of matches) {
    const soleGameThere = played.get(match.divisionId ?? "") === 1;
    const final =
      isFinal(match) || (isKnockoutDivision(match.division?.name) && soleGameThere);
    if (!final) continue;

    const place = placeIn({ ...match, stage: "ko", round: "final" }, teamId);
    // A champion is never overwritten by a runner-up from the same event —
    // there is only one final per division, but an event with two divisions
    // is one a team could in principle appear in twice.
    if (place && out.get(match.eventId) !== "champion") out.set(match.eventId, place);
  }

  const byDivision = new Map<string, T[]>();
  for (const match of tables) {
    const key = `${match.eventId}::${match.divisionId ?? ""}`;
    byDivision.set(key, [...(byDivision.get(key) ?? []), match]);
  }
  for (const division of byDivision.values()) {
    const eventId = division[0].eventId;
    if (out.has(eventId)) continue;
    const top = tableChampion(division);
    if (!top) continue;
    if (top.champion === teamId) out.set(eventId, "champion");
    else if (top.runnerUp === teamId) out.set(eventId, "runner-up");
  }
  return out;
}

export const PLACE_LABEL: Record<Place, string> = {
  champion: "🏆 Champion",
  "runner-up": "🥈 Runner-up",
};
