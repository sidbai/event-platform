/**
 * A standings table somebody copied out of the platform that keeps it.
 *
 * We compute standings from results, and for an event we run that is correct
 * — they are our rules. For somebody else's tournament it is a guess wearing
 * a table's clothes: three points a win, goal difference capped at six, our
 * tiebreaker order. A tournament that awards a bonus for a shutout, or caps
 * goals differently, or breaks ties on head-to-head where we use goals for,
 * produces a different table from the same results. Ours would be wrong in a
 * way nobody could see, and a parent would read their child's team into the
 * wrong position.
 *
 * So when the organizer publishes a table, take theirs.
 *
 * Read by column name rather than by position. Every platform prints these in
 * a different order and calls them different things — GP, PL, MP, P for the
 * same column — and guessing at position is how "played" becomes "points".
 */

export type PastedStanding = {
  team: string;
  /** The heading above the table it came from — "Group A" — where the copier saw one. */
  group: string | null;
  played: number | null;
  won: number | null;
  drawn: number | null;
  lost: number | null;
  gf: number | null;
  ga: number | null;
  points: number | null;
};

export type StandingsPaste = {
  rows: PastedStanding[];
  /** Lines that looked like standings but could not be read, as pasted. */
  skipped: string[];
};

/**
 * What each column might be called.
 *
 * Deliberately strict about the ambiguous ones. "P" is played on one platform
 * and points on another, so it is not accepted for either — a table where
 * every team has three points and three games looks fine until it doesn't.
 */
const COLUMNS: { key: keyof PastedStanding; names: RegExp }[] = [
  // "Teams", plural, is what AthleteOne heads the column with — and a table
  // whose team column is unrecognised is not read as a table at all.
  { key: "team", names: /^(teams?|club|name|team name)$/i },
  // Written by the copier from the heading over each table; no platform
  // prints it as a column of its own.
  { key: "group", names: /^(group|bracket|pool|flight)$/i },
  { key: "played", names: /^(gp|pl|mp|played|games|gms|games played|w-l-d|matches)$/i },
  { key: "won", names: /^(w|win|wins|won)$/i },
  { key: "drawn", names: /^(d|t|tie|ties|draw|draws|drawn|tied)$/i },
  { key: "lost", names: /^(l|loss|losses|lost)$/i },
  { key: "gf", names: /^(gf|f|for|goals for|gs|scored)$/i },
  { key: "ga", names: /^(ga|a|against|goals against|gc|conceded)$/i },
  { key: "points", names: /^(pts|pt|points|total points)$/i },
];

function cells(line: string): string[] {
  const parts = line.includes("\t") ? line.split("\t") : line.split(/\s{2,}/);
  return parts.map((c) => c.trim());
}

/** The column positions of a standings header, or null if it is not one. */
export function readStandingsHeader(line: string): Map<keyof PastedStanding, number> | null {
  const found = new Map<keyof PastedStanding, number>();
  cells(line).forEach((cell, i) => {
    // Some tables lead with an unlabelled rank column, or letter a division
    // name across the top; both are simply columns nobody claims.
    const match = COLUMNS.find((c) => c.names.test(cell));
    if (match && !found.has(match.key)) found.set(match.key, i);
  });

  // A table without a team column is not a table we can attach to anything,
  // and one without points is not a standing — it is a list of games played.
  return found.has("team") && found.has("points") ? found : null;
}

function num(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  const m = raw.trim().match(/^[+-]?(\d{1,3})$/);
  return m ? Number(m[0]) : null;
}

/**
 * Turn a pasted standings table into rows.
 *
 * Requires the header, because everything else here depends on knowing which
 * column is which — and a table pasted without its header is one we would
 * have to guess at, which is the thing this exists to stop.
 */
export function parsePastedStandings(text: string): StandingsPaste {
  const rows: PastedStanding[] = [];
  const skipped: string[] = [];
  let header: Map<keyof PastedStanding, number> | null = null;

  for (const raw of text.split(/\r?\n/)) {
    if (!raw.trim()) continue;
    /*
     * Only the trailing end. Trimming the whole line eats a leading empty
     * cell, and a table whose first column is blank then shifts every value
     * one place left — the games-played number read as the team's name.
     */
    const line = raw.replace(/\s+$/, "");

    if (!header) {
      header = readStandingsHeader(line);
      if (!header) skipped.push(line);
      continue;
    }

    const c = cells(line);
    const at = (key: keyof PastedStanding) => {
      const i = header!.get(key);
      return i === undefined ? undefined : c[i];
    };

    const team = (at("team") ?? "").trim();
    const points = num(at("points"));
    // A row with no team name is a spacer or a group heading; a row with a
    // team and no points is a team that has not played, which is a real row
    // worth keeping at zero rather than dropping.
    if (!team) {
      skipped.push(line);
      continue;
    }

    rows.push({
      team,
      group: (at("group") ?? "").trim() || null,
      played: num(at("played")),
      won: num(at("won")),
      drawn: num(at("drawn")),
      lost: num(at("lost")),
      gf: num(at("gf")),
      ga: num(at("ga")),
      points: points ?? 0,
    });
  }

  return { rows, skipped };
}
