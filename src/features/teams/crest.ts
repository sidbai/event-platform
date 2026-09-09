/**
 * Which image stands for a team.
 *
 * Its own if it has one, and otherwise its club's. Nearly every team here was
 * created by an import and has no crest of its own — 4 of the 181 at the
 * Eastside FC Cup — while the club it belongs to almost always does. Without
 * the fallback a schedule of Crossfire against Seattle United shows two grey
 * squares, which is the page looking broken rather than sparse.
 *
 * A function rather than `a ?? b` at each call site, because it was already
 * written twice on the team pages and not at all on the event page, which is
 * exactly how a rule ends up applying in some places and not others.
 */
export type Crested = {
  crestUrl: string | null;
  club?: { crestUrl: string | null } | null;
};

export function crestOf(team: Crested | null | undefined): string | null {
  if (!team) return null;
  return team.crestUrl ?? team.club?.crestUrl ?? null;
}
