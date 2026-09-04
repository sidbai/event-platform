export type MatchResult = {
  homeTeamId: string | null;
  awayTeamId: string | null;
  homeScore: number | null;
  awayScore: number | null;
};

export type StandingRow = {
  teamId: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  gf: number;
  ga: number;
  gd: number;
  points: number;
  /** goal stats clamped per game — used only for tiebreakers */
  capGf: number;
  capGa: number;
  capGd: number;
};

export type StandingsConfig = {
  points?: { win: number; draw: number; loss: number };
  /** per-game clamp for goal difference / goals for / goals against */
  goalCap?: number;
  tiebreakers?: string[];
};

const DEFAULTS = {
  points: { win: 3, draw: 1, loss: 0 },
  goalCap: 6,
  tiebreakers: [
    "head_to_head",
    "goal_difference",
    "most_wins",
    "goals_for",
    "goals_against",
    "coin_toss",
  ],
};

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

function emptyRow(teamId: string): StandingRow {
  return {
    teamId,
    played: 0,
    won: 0,
    drawn: 0,
    lost: 0,
    gf: 0,
    ga: 0,
    gd: 0,
    points: 0,
    capGf: 0,
    capGa: 0,
    capGd: 0,
  };
}

/**
 * Group-stage table from a set of completed matches. Pass `teamIds` to seed
 * rows for teams with no games yet and to restrict to matches among them.
 */
export function computeStandings(
  matches: MatchResult[],
  teamIds?: string[],
  config: StandingsConfig = {},
): Map<string, StandingRow> {
  const points = config.points ?? DEFAULTS.points;
  const cap = config.goalCap ?? DEFAULTS.goalCap;
  const restrict = teamIds ? new Set(teamIds) : null;

  const rows = new Map<string, StandingRow>();
  const ensure = (id: string) => {
    let row = rows.get(id);
    if (!row) {
      row = emptyRow(id);
      rows.set(id, row);
    }
    return row;
  };
  restrict?.forEach((id) => ensure(id));

  for (const m of matches) {
    const { homeTeamId: h, awayTeamId: a, homeScore: hs, awayScore: as } = m;
    if (!h || !a || hs == null || as == null) continue;
    if (restrict && (!restrict.has(h) || !restrict.has(a))) continue;

    const home = ensure(h);
    const away = ensure(a);

    home.played++;
    away.played++;
    home.gf += hs;
    home.ga += as;
    away.gf += as;
    away.ga += hs;
    home.capGf += Math.min(hs, cap);
    home.capGa += Math.min(as, cap);
    away.capGf += Math.min(as, cap);
    away.capGa += Math.min(hs, cap);
    home.capGd += clamp(hs - as, -cap, cap);
    away.capGd += clamp(as - hs, -cap, cap);

    if (hs > as) {
      home.won++;
      away.lost++;
      home.points += points.win;
      away.points += points.loss;
    } else if (hs < as) {
      away.won++;
      home.lost++;
      away.points += points.win;
      home.points += points.loss;
    } else {
      home.drawn++;
      away.drawn++;
      home.points += points.draw;
      away.points += points.draw;
    }
  }

  for (const row of rows.values()) row.gd = row.gf - row.ga;
  return rows;
}

function tieCompare(
  rule: string,
  a: StandingRow,
  b: StandingRow,
  matches: MatchResult[],
  tiedIds: string[],
  config: StandingsConfig,
): number {
  switch (rule) {
    case "head_to_head": {
      if (tiedIds.length < 2) return 0;
      const mini = computeStandings(matches, tiedIds, config);
      const ma = mini.get(a.teamId);
      const mb = mini.get(b.teamId);
      if (!ma || !mb) return 0;
      if (mb.points !== ma.points) return mb.points - ma.points;
      if (mb.capGd !== ma.capGd) return mb.capGd - ma.capGd;
      return mb.capGf - ma.capGf;
    }
    case "goal_difference":
      return b.capGd - a.capGd;
    case "most_wins":
      return b.won - a.won;
    case "goals_for":
      return b.capGf - a.capGf;
    case "goals_against":
      return a.capGa - b.capGa;
    default:
      return 0;
  }
}

/** Orders a table applying the configured tiebreakers within equal-points runs. */
export function rankStandings(
  rows: StandingRow[],
  matches: MatchResult[],
  config: StandingsConfig = {},
): StandingRow[] {
  const tiebreakers = config.tiebreakers ?? DEFAULTS.tiebreakers;
  const byPoints = [...rows].sort((a, b) => b.points - a.points);

  const out: StandingRow[] = [];
  let i = 0;
  while (i < byPoints.length) {
    let j = i;
    while (j < byPoints.length && byPoints[j].points === byPoints[i].points) j++;
    const run = byPoints.slice(i, j);
    if (run.length > 1) {
      const tiedIds = run.map((r) => r.teamId);
      run.sort((a, b) => {
        for (const rule of tiebreakers) {
          const d = tieCompare(rule, a, b, matches, tiedIds, config);
          if (d !== 0) return d;
        }
        return a.teamId.localeCompare(b.teamId);
      });
    }
    out.push(...run);
    i = j;
  }
  return out;
}
