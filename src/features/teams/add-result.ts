/**
 * A result a team's own people are telling us about.
 *
 * The case this exists for: a side flies to Dallas or to Spain, plays five
 * games worth knowing about, and none of it is anywhere near a platform we
 * read. Nobody is going to fill in a tournament record to get those five
 * scores in, so this takes what a parent actually knows — the day, who they
 * played, and the score — and asks for nothing else.
 *
 * Pure. Everything it refuses, it refuses with a reason a person can act on.
 */

export type ResultInput = {
  playedOn?: string | null;
  opponent?: string | null;
  ourScore?: string | null;
  theirScore?: string | null;
  /** Which cup, as they write it. Optional: a friendly has no name. */
  competition?: string | null;
  /** Away is the common case for a tournament nobody here is hosting. */
  wasHome?: boolean;
};

export type CheckedResult =
  | {
      ok: true;
      value: {
        playedOn: Date;
        opponent: string;
        ourScore: number;
        theirScore: number;
        competition: string | null;
        wasHome: boolean;
      };
    }
  | { ok: false; error: string };

export const MAX_OPPONENT = 80;
export const MAX_COMPETITION = 80;
/** Nothing before this is a result anybody is adding by hand. */
const EARLIEST = new Date("2000-01-01T00:00:00Z");

const tidy = (s: string | null | undefined) => (s ?? "").trim().replace(/\s+/g, " ");

function score(raw: string | null | undefined): number | null {
  const text = tidy(raw);
  if (!/^\d{1,2}$/.test(text)) return null;
  return Number(text);
}

export function checkResult(input: ResultInput, now: Date = new Date()): CheckedResult {
  const opponent = tidy(input.opponent);
  if (opponent.length < 2) return { ok: false, error: "Who did you play?" };
  if (opponent.length > MAX_OPPONENT) {
    return { ok: false, error: "That opponent name is too long." };
  }

  const day = tidy(input.playedOn);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    return { ok: false, error: "Give the date as 2026-07-12." };
  }
  /*
   * Midday UTC, not midnight.
   *
   * What is known here is the day, not the kick-off — nobody remembers that a
   * game in Dallas started at 08:40 local. Stored at midnight it lands on the
   * previous day for every reader west of Greenwich, which is all of them.
   */
  const playedOn = new Date(`${day}T12:00:00Z`);
  if (Number.isNaN(playedOn.getTime())) {
    return { ok: false, error: "That is not a date." };
  }
  if (playedOn > now) {
    // A result, not a fixture. A date in the future is a typo in the year
    // far more often than it is somebody filing next week's game early.
    return { ok: false, error: "That date has not happened yet." };
  }
  if (playedOn < EARLIEST) return { ok: false, error: "That date is too long ago." };

  const ourScore = score(input.ourScore);
  const theirScore = score(input.theirScore);
  if (ourScore === null || theirScore === null) {
    return { ok: false, error: "Give both scores as whole numbers." };
  }

  const competition = tidy(input.competition);
  if (competition.length > MAX_COMPETITION) {
    return { ok: false, error: "That competition name is too long." };
  }

  return {
    ok: true,
    value: {
      playedOn,
      opponent,
      ourScore,
      theirScore,
      competition: competition === "" ? null : competition,
      wasHome: input.wasHome === true,
    },
  };
}

/**
 * Whether two competition names are the same one written twice.
 *
 * Same normalisation the club and team matchers use — letters and digits,
 * lowercased — so "Surf Cup", "surf cup" and "SurfCup" find each other. It is
 * deliberately no cleverer than that: "Surf Cup" and "Surf Cup San Diego" stay
 * apart, because merging two real tournaments on a guess is worse than
 * carrying two records until somebody says they are the same.
 */
export function sameCompetition(a: string, b: string): boolean {
  const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  return key(a) !== "" && key(a) === key(b);
}
