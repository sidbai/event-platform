/**
 * A result as one string, shootout and all.
 *
 * "2 – 2 (4–3 pens)": the score is the score, and the shootout is said
 * beside it rather than folded into it. A knockout that ended level was
 * decided somewhere, and a page that prints 2 – 2 and nothing else leaves
 * the reader to guess who went through.
 */
export type Scored = {
  homeScore: number | null;
  awayScore: number | null;
  homePens?: number | null;
  awayPens?: number | null;
};

export function scoreLabel(m: Scored, dash = " – "): string | null {
  if (m.homeScore === null || m.awayScore === null) return null;
  const pens = shootout(m);
  return `${m.homeScore}${dash}${m.awayScore}${pens ? ` (${pens.home}–${pens.away} pens)` : ""}`;
}

/** The shootout, where both numbers are known. */
export function shootout(m: Scored): { home: number; away: number } | null {
  return m.homePens != null && m.awayPens != null ? { home: m.homePens, away: m.awayPens } : null;
}

/**
 * Who won, with the shootout deciding a level game.
 *
 * Null for a game not played, a level game with no shootout recorded, or a
 * shootout that is itself level — none of which is a result anybody should
 * be credited with.
 */
export function winner(m: Scored): "home" | "away" | null {
  if (m.homeScore === null || m.awayScore === null) return null;
  if (m.homeScore !== m.awayScore) return m.homeScore > m.awayScore ? "home" : "away";
  const pens = shootout(m);
  if (!pens || pens.home === pens.away) return null;
  return pens.home > pens.away ? "home" : "away";
}
