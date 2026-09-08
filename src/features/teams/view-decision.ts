export type ViewableTeam = {
  visibility: string;
  /** Set when the team was created for an event rather than by a person. */
  originEventId: string | null;
};

/**
 * Who may open a team's page.
 *
 * One rule now: public teams are public, private teams are members-only.
 *
 * It used to be two, because `teams.visibility` carried two meanings. A team
 * auto-created for a tournament was written 'private', meaning "we did not
 * put it here on purpose" rather than "keep it secret" — and since its page
 * is linked from public standings, every query about a team needed a second
 * clause to let those through. Teams are created listed now, so the second
 * meaning is gone and private is a promise again: whoever set it meant it.
 *
 * `originEventId` stays on the type because callers pass whole rows, and
 * because a future rule about event-made teams should be written knowingly
 * rather than by accident.
 *
 * Kept free of I/O so the rules can be tested directly.
 */
export function teamViewDecision(
  team: ViewableTeam,
  admin: boolean,
): "allow" | "check-member" {
  if (admin) return "allow";
  return team.visibility === "public" ? "allow" : "check-member";
}
