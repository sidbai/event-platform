/**
 * The competition rules an organizer sets, and the shape they are stored in.
 *
 * These live in events.metadata rather than columns, because they are read as
 * a block on the event page and never queried across events. Until now they
 * were seeded by hand — King Juan Cup's rules exist only because a script put
 * them there, which is not a thing a second organizer can do.
 *
 * Parsing is pure and separate from the write so the awkward parts — a goal
 * cap that must not be zero, a tiebreaker order that has to stay canonical to
 * mean anything to rankStandings — are asserted rather than trusted.
 */

import type { Parsed } from "./division-input";
import { POINTS_SYSTEMS, type PointsSystem } from "./standings";

/**
 * The tiebreakers rankStandings can actually apply, in the order they are
 * applied. Offering a rule the ranker does not implement would be a promise
 * the table quietly breaks; "coin toss" is deliberately absent, because what
 * happens after these is decided by people, not by us.
 */
export const TIEBREAKERS = [
  { id: "head_to_head", label: "Head-to-head result" },
  { id: "goal_difference", label: "Goal difference" },
  { id: "most_wins", label: "Most wins" },
  { id: "goals_for", label: "Goals scored" },
  { id: "goals_against", label: "Fewest goals conceded" },
] as const;

export type TiebreakerId = (typeof TIEBREAKERS)[number]["id"];

export type Rules = {
  gameFormat?: string;
  advancement?: string;
  roster?: string;
  tiebreakers: string[];
  goalCapPerGame?: number;
  /**
   * How a result becomes points. Absent means three for a win — every table
   * built before this field existed was computed that way, so reading the
   * absence as anything else would silently restate old standings.
   */
  pointsSystem?: PointsSystem["id"];
  /** How many periods a game is played in, and how long each one is. */
  periods?: number;
  periodMinutes?: number;
};

const isTiebreaker = (v: string): v is TiebreakerId =>
  TIEBREAKERS.some((t) => t.id === v);

const isPointsSystem = (v: string): v is PointsSystem["id"] => v in POINTS_SYSTEMS;

/**
 * Put chosen tiebreakers back into the order rankStandings applies them.
 *
 * The form is a set of checkboxes, and a browser returns them in DOM order —
 * which happens to be canonical today and would stop being so the moment
 * someone reorders the markup. Sorting here means the stored order is a
 * property of this list, not of a template.
 */
export function orderTiebreakers(chosen: string[]): TiebreakerId[] {
  const picked = new Set(chosen.filter(isTiebreaker));
  return TIEBREAKERS.map((t) => t.id).filter((id) => picked.has(id));
}

function parseMinutes(raw: string, label: string, max: number): Parsed<number | null> {
  const s = raw.trim();
  if (s === "") return { ok: true, value: null };
  if (!/^\d+$/.test(s)) return { ok: false, error: `${label} is a whole number.` };
  const n = Number(s);
  if (n < 1 || n > max) return { ok: false, error: `${label} is between 1 and ${max}.` };
  return { ok: true, value: n };
}

export function parseRules(form: {
  gameFormat: string;
  advancement: string;
  roster: string;
  tiebreakers: string[];
  goalCap: string;
  periods: string;
  periodMinutes: string;
  pointsSystem?: string;
}): Parsed<Rules> {
  const cap = parseMinutes(form.goalCap, "Goal cap", 99);
  if (!cap.ok) return cap;

  const periods = parseMinutes(form.periods, "Number of periods", 4);
  if (!periods.ok) return periods;

  const periodMinutes = parseMinutes(form.periodMinutes, "Period length", 60);
  if (!periodMinutes.ok) return periodMinutes;

  // Half of a half-time is not a rule anyone can play to: a length with no
  // count, or a count with no length, describes nothing.
  if ((periods.value === null) !== (periodMinutes.value === null)) {
    return {
      ok: false,
      error: "Set both how many periods and how long each one is, or neither.",
    };
  }

  const rules: Rules = { tiebreakers: orderTiebreakers(form.tiebreakers) };
  const gameFormat = form.gameFormat.trim();
  const advancement = form.advancement.trim();
  const roster = form.roster.trim();
  if (gameFormat) rules.gameFormat = gameFormat.slice(0, 300);
  if (advancement) rules.advancement = advancement.slice(0, 300);
  if (roster) rules.roster = roster.slice(0, 300);
  if (cap.value !== null) rules.goalCapPerGame = cap.value;
  // Only stored when it is not the default, so a table computed the ordinary
  // way carries no claim about its scoring.
  const system = (form.pointsSystem ?? "").trim();
  if (system && isPointsSystem(system) && system !== "standard") {
    rules.pointsSystem = system;
  }
  if (periods.value !== null) rules.periods = periods.value;
  if (periodMinutes.value !== null) rules.periodMinutes = periodMinutes.value;

  return { ok: true, value: rules };
}

/** "2 × 30 min halves", or nothing to say. */
export function describePeriods(rules: Rules): string | null {
  if (!rules.periods || !rules.periodMinutes) return null;
  const noun =
    rules.periods === 2 ? "halves" : rules.periods === 4 ? "quarters" : "periods";
  return `${rules.periods} × ${rules.periodMinutes} min ${noun}`;
}
