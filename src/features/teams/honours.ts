/**
 * Whether a team won a tournament, worked out from the final itself.
 *
 * Two platforms say "this was the final" two ways. An event run here writes
 * a knockout stage and a round; an imported one carries the organizer's own
 * label, and Athletes2Events writes "Final" in the same field it uses for
 * "Semi-Finals A" and "Gold 2". Both are read here so the answer does not
 * depend on where the schedule came from.
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
  const out = new Map<string, Place>();
  for (const match of matches) {
    const place = placeIn(match, teamId);
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
