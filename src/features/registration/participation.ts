/**
 * Turning a decision on an entry into a place in the competition.
 *
 * The schema draws the line already: a registration is an application,
 * event_teams is participation, and accepting one is meant to create the
 * other. Until now nothing did — an organizer who accepted a team then had to
 * type its name again on the scores page, which minted a second, empty team
 * with no crest, no roster and no link to the club that had actually entered.
 * Two rows for one team, and the schedule pointing at the wrong one.
 *
 * The decision is pure because the interesting part is not the write, it is
 * knowing when NOT to write: taking a team back out once it has fixtures
 * leaves matches naming a team that has no standings row, which is worse than
 * an accepted flag that disagrees with the schedule.
 */

export type RegistrationStatus =
  | "requested"
  | "accepted"
  | "waitlisted"
  | "declined"
  | "withdrawn";

export type ParticipationChange =
  /** Put the team in this division, or move it if it is already elsewhere. */
  | { action: "enter"; divisionId: string }
  /** Take the team out; it has no fixtures, so nothing is left dangling. */
  | { action: "remove" }
  /** Leave it in: it is playing, and the schedule would break without it. */
  | { action: "keep"; reason: "has-fixtures" }
  /** Already in the state the decision calls for. */
  | { action: "none" };

export type Current = {
  /** Whether an event_teams row exists for this team in this event. */
  participating: boolean;
  /** The division that row points at, if any. */
  divisionId: string | null;
  /** Whether any match in the event names this team. */
  hasFixtures: boolean;
};

/**
 * What accepting, waitlisting, declining or withdrawing should do to the
 * team's place in the event.
 *
 * Accepting is idempotent, so an organizer clicking Accept on a team that is
 * already in does nothing rather than resetting its standings. Accepting into
 * a different division moves it, because a team cannot be in two — the
 * event_teams unique is on (event, team), not (event, team, division).
 */
export function participationFor(
  status: RegistrationStatus,
  divisionId: string,
  current: Current,
): ParticipationChange {
  if (status === "accepted") {
    if (current.participating && current.divisionId === divisionId) {
      return { action: "none" };
    }
    return { action: "enter", divisionId };
  }

  if (!current.participating) return { action: "none" };
  // A played or scheduled match is a commitment to other teams. Undoing an
  // acceptance should not quietly empty a fixture list, so the row stays and
  // the organizer is told, rather than the schedule silently rotting.
  if (current.hasFixtures) return { action: "keep", reason: "has-fixtures" };
  return { action: "remove" };
}
