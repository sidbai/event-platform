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
 * not played yet, and one that ended level was decided by penalties this
 * does not hold — a page claiming the wrong champion is worse than a page
 * saying nothing.
 */

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
  if (match.homeScore === null || match.awayScore === null) return null;
  // A draw was settled by penalties, which this does not hold.
  if (match.homeScore === match.awayScore) return null;

  const homeWon = match.homeScore > match.awayScore;
  if (match.homeTeamId === teamId) return homeWon ? "champion" : "runner-up";
  if (match.awayTeamId === teamId) return homeWon ? "runner-up" : "champion";
  return null;
}

/**
 * What a team won, keyed by the event it won it at.
 *
 * One entry per event rather than per division: a team plays in one division
 * of one tournament, and the event is what a reader recognises.
 */
export function honoursByEvent<T extends FinalLike & { eventId: string }>(
  matches: T[],
  teamId: string,
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
  return out;
}

export const PLACE_LABEL: Record<Place, string> = {
  champion: "🏆 Champion",
  "runner-up": "🥈 Runner-up",
};
