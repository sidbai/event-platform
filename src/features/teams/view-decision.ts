export type ViewableTeam = {
  visibility: string;
  /** Set when the team was created for an event rather than by a person. */
  originEventId: string | null;
};

/**
 * `teams.visibility` carries two different meanings, and they need different
 * rules:
 *
 * - A team auto-created for a tournament is 'private' only in the sense of
 *   "keep it out of the directory". Its page is linked from public standings,
 *   so anyone who can see the event must be able to open it.
 * - A team a person created and marked private was promised "only people you
 *   invite will see it", so it is members-only.
 *
 * `originEventId` is what separates them.
 *
 * Kept free of I/O so the rules can be tested directly.
 */
export function teamViewDecision(
  team: ViewableTeam,
  admin: boolean,
): "allow" | "check-member" {
  if (admin) return "allow";
  if (team.visibility === "public") return "allow";
  if (team.originEventId) return "allow";
  return "check-member";
}
