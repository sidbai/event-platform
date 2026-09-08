import { normaliseTeamName } from "./merge-plan";

/**
 * Whether an imported name is a team we already have.
 *
 * A connector looks for existing teams only inside the event it is syncing,
 * so a new tournament mints a fresh row for every side — including the
 * hundred already here from last month. The queue then asks somebody to put
 * back together what the import just split: 177 of the 191 pairs waiting in
 * it were this, and none of them ever needed a person.
 *
 * The bar is deliberately higher than a matching name. Two clubs in one
 * region both fielding a "Warriors" is real, and binding is automatic — so a
 * name must match exactly, nothing may contradict, and at least one fact must
 * positively agree. Two bare rows with no club, no cohort and no tier agree
 * about nothing, and stay a question for a person.
 */

export type BindCandidate = {
  id: string;
  name: string;
  clubId: string | null;
  gender: string | null;
  birthYears: number[];
  tier: string | null;
};

const sharesYear = (a: number[], b: number[]) => a.some((y) => b.includes(y));

/** A fact that rules the two out, or null. Unknowns rule out nothing. */
export function contradiction(a: BindCandidate, b: BindCandidate): string | null {
  if (a.clubId && b.clubId && a.clubId !== b.clubId) return "different clubs";
  if (a.gender && b.gender && a.gender !== b.gender) return "different genders";
  if (a.tier && b.tier && a.tier !== b.tier) return "different tiers";
  if (a.birthYears.length && b.birthYears.length && !sharesYear(a.birthYears, b.birthYears)) {
    return "different birth years";
  }
  return null;
}

/** A fact that actively says these are the same side. */
export function agreement(a: BindCandidate, b: BindCandidate): boolean {
  if (a.clubId && a.clubId === b.clubId) return true;
  if (a.birthYears.length && b.birthYears.length && sharesYear(a.birthYears, b.birthYears)) {
    return true;
  }
  return Boolean(a.tier && a.tier === b.tier);
}

/**
 * Whether these two rows are the same side, on the strict rule.
 *
 * The name matches exactly, nothing contradicts, and some fact agrees. Used
 * both when an import arrives and when clearing the backlog those imports
 * left behind, so the two cannot drift apart.
 */
export function canBind(a: BindCandidate, b: BindCandidate): boolean {
  const key = normaliseTeamName(a.name);
  if (!key || key !== normaliseTeamName(b.name)) return false;
  if (a.id === b.id) return false;
  return !contradiction(a, b) && agreement(a, b);
}

/**
 * The team an imported name should attach to, or null to make a new one.
 *
 * Never guesses between two: if the name matches more than one team that
 * would otherwise qualify, nobody can say which, and a new row plus a queue
 * entry is the honest outcome.
 */
export function teamToBindTo(
  incoming: BindCandidate,
  existing: BindCandidate[],
): BindCandidate | null {
  const key = normaliseTeamName(incoming.name);
  if (!key) return null;

  const eligible = existing.filter((candidate) => canBind(incoming, candidate));
  /*
   * One team, not one row.
   *
   * A team is offered here under its own name and under every name an event
   * has published for it, so the same team can qualify several times over.
   * Counting rows would refuse exactly the case that is for.
   */
  const ids = new Set(eligible.map((c) => c.id));
  return ids.size === 1 ? eligible[0] : null;
}
