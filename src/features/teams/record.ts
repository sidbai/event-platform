/**
 * A team's record, worked out from the games it actually played.
 *
 * The team page had these numbers already — it read won/drawn/lost off the
 * event_teams row, which an organizer running their event here fills in and a
 * connector never touches. So every synced team read "0 W 0 D 0 L · 0–0"
 * directly above a list of matches showing a win, a loss and a draw. The page
 * contradicted itself in the space of two lines.
 *
 * Points are deliberately absent. Three points a win is our rule, not
 * everyone's, and adding up points across tournaments that score differently
 * produces a number that belongs to no competition — the same reason the
 * standings table prefers the organizer's own figures. Wins, draws, losses
 * and goals are facts; points are an interpretation.
 */

export type Playable = {
  homeTeamId: string | null;
  awayTeamId: string | null;
  homeScore: number | null;
  awayScore: number | null;
};

export type TeamRecord = {
  played: number;
  won: number;
  drawn: number;
  lost: number;
  gf: number;
  ga: number;
};

export const EMPTY_RECORD: TeamRecord = {
  played: 0,
  won: 0,
  drawn: 0,
  lost: 0,
  gf: 0,
  ga: 0,
};

/** How a match went for one particular side, or null if it has not been played. */
export function resultFor(
  match: Playable,
  teamId: string,
): { for: number; against: number; outcome: "won" | "drawn" | "lost" } | null {
  const home = match.homeTeamId === teamId;
  const away = match.awayTeamId === teamId;
  if (!home && !away) return null;

  const us = home ? match.homeScore : match.awayScore;
  const them = home ? match.awayScore : match.homeScore;
  // A fixture with no score has not been played. Counting it as a nil-nil
  // would give both sides a draw they never earned.
  if (us === null || them === null) return null;

  return {
    for: us,
    against: them,
    outcome: us > them ? "won" : us < them ? "lost" : "drawn",
  };
}

export function recordFrom(matches: Playable[], teamId: string): TeamRecord {
  const record = { ...EMPTY_RECORD };

  for (const match of matches) {
    const result = resultFor(match, teamId);
    if (!result) continue;
    record.played++;
    record[result.outcome]++;
    record.gf += result.for;
    record.ga += result.against;
  }

  return record;
}

/** "3 W 1 D 2 L · 12–8", the way a parent reads a season back. */
export function formatRecord(record: TeamRecord): string {
  return `${record.won}W ${record.drawn}D ${record.lost}L · ${record.gf}–${record.ga}`;
}
