/**
 * A schedule somebody copied out of their browser.
 *
 * Some platforms cannot be read automatically — a robots.txt that refuses
 * crawlers, terms that require permission first, or simply a page whose
 * fixtures never exist in the HTML at all. A person opening that page in
 * their own browser is a visitor, which is what the page is for, and what
 * they copy out of it can be brought in here. This is that, done once
 * instead of four hundred times.
 *
 * Deliberately tolerant about shape and strict about meaning. Every platform
 * lays a schedule out differently and none will warn us before changing it,
 * so this looks for what a fixture cannot do without — a time and two teams —
 * rather than for a fixed column order. A line it cannot read is reported,
 * never guessed at: a directory that invents a kick-off time is worse than
 * one that admits it dropped a row.
 */

import type { SyncedEvent, SyncedMatch, SyncedTeam } from "./provider";

export type PastedMatch = {
  division: string;
  /** YYYY-MM-DD, from the date heading this row sits under. */
  date: string | null;
  /** 24-hour HH:MM, as the rest of the sync layer expects. */
  time: string | null;
  /** The bracket, where the row names one: "A1 vs A4" is bracket A. */
  group: string | null;
  field: string | null;
  home: string;
  away: string;
  homeScore: number | null;
  awayScore: number | null;
};

export type PasteResult = {
  matches: PastedMatch[];
  /** Lines that looked like fixtures but could not be read, as pasted. */
  skipped: string[];
};

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

/** "Sat, Sep 5, 2026", "September 5", "9/5/2026" → 2026-09-05. */
export function parsePastedDate(line: string, fallbackYear: number): string | null {
  const named = line.match(
    /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:\s*,?\s*(\d{4}))?/i,
  );
  if (named) {
    return iso(
      named[3] ? Number(named[3]) : fallbackYear,
      MONTHS[named[1].toLowerCase()],
      Number(named[2]),
    );
  }

  // Month first: these are American schedules, and a European reading would
  // put half the tournament in May.
  const numeric = line.match(/\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b/);
  if (!numeric) return null;
  const raw = numeric[3] ? Number(numeric[3]) : fallbackYear;
  return iso(raw < 100 ? 2000 + raw : raw, Number(numeric[1]), Number(numeric[2]));
}

function iso(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const at = new Date(Date.UTC(year, month - 1, day));
  // Rejects 31 February, which the bounds above happily allow.
  if (at.getUTCMonth() !== month - 1 || at.getUTCDate() !== day) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** "9:05 AM", "9:05am", "14:30" → "09:05" / "14:30". */
export function parsePastedTime(raw: string): string | null {
  const ampm = raw.match(/\b(\d{1,2}):(\d{2})\s*([ap])\.?m\.?/i);
  if (ampm) {
    let hour = Number(ampm[1]) % 12;
    if (ampm[3].toLowerCase() === "p") hour += 12;
    return `${String(hour).padStart(2, "0")}:${ampm[2]}`;
  }
  const h24 = raw.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
  return h24 ? `${h24[1].padStart(2, "0")}:${h24[2]}` : null;
}

/** A score cell. "-", "" and anything non-numeric mean "not played yet". */
function parseScoreCell(raw: string): number | null {
  const m = raw.trim().match(/^(\d{1,3})$/);
  return m ? Number(m[1]) : null;
}

/** "3 - 1" in a single cell, the way some platforms print it. */
export function parsePastedScore(raw: string): [number, number] | null {
  const m = raw.trim().match(/^(\d{1,2})\s*[-–:]\s*(\d{1,2})$/);
  return m ? [Number(m[1]), Number(m[2])] : null;
}

/**
 * The bracket a slot label belongs to.
 *
 * "A1 vs A4" is bracket A; "5 vs 1" is a division small enough not to have
 * brackets, and gets none rather than an invented one.
 */
export function bracketOf(slot: string): string | null {
  const m = slot.trim().match(/^([A-Z])\d/);
  return m ? m[1] : null;
}

/**
 * Split a pasted line into cells.
 *
 * A browser copying a table gives tabs. Somebody copying a list of cards
 * gives runs of spaces. Both are one row per line, which is the only shape
 * assumption here.
 */
function cells(line: string): string[] {
  const parts = line.includes("\t") ? line.split("\t") : line.split(/\s{2,}/);
  return parts.map((c) => c.trim());
}

const HEADER = /^(time|date|game|field|court|pitch|home|away|home team|away team|score|division|flight|location|venue|site)$/i;
const VERSUS = /^(vs\.?|v|@|at|-|–)$/i;

/**
 * The columns the copier emits, in order.
 *
 * A schedule table packs the kick-off, the bracket slot and the division into
 * one cell, and how that survives a browser copy decides where each ends —
 * which is a guess. So the copier splits them into named columns instead, and
 * a paste that carries this header is read by name rather than by shape.
 */
export const CANONICAL_HEADER = [
  "date",
  "time",
  "slot",
  "division",
  "home",
  "home_score",
  "away_score",
  "away",
  "field",
  "venue",
] as const;

type Canonical = (typeof CANONICAL_HEADER)[number];

/** The column positions of a canonical header line, or null if it isn't one. */
function readHeader(line: string): Map<Canonical, number> | null {
  const columns = cells(line).map((c) => c.toLowerCase().replace(/\s+/g, "_"));
  const found = new Map<Canonical, number>();
  columns.forEach((c, i) => {
    if ((CANONICAL_HEADER as readonly string[]).includes(c)) {
      found.set(c as Canonical, i);
    }
  });
  // Home and away are the two a fixture cannot do without; the rest are
  // allowed to be missing, because not every platform prints all of them.
  return found.has("home") && found.has("away") ? found : null;
}

export type PasteOptions = {
  /** What to call a row that does not say. Most pastes are one flight. */
  division: string;
  /** For date headings that omit it, as most do. */
  year: number;
};

/** Turn a pasted schedule into fixtures. */
export function parsePastedSchedule(text: string, options: PasteOptions): PasteResult {
  const matches: PastedMatch[] = [];
  const skipped: string[] = [];
  let date: string | null = null;

  let header: Map<Canonical, number> | null = null;

  for (const raw of text.split(/\r?\n/)) {
    if (!raw.trim()) continue;
    /*
     * Only the trailing end. Trimming the whole line eats a leading empty
     * cell, and a table whose first column is blank then shifts every value
     * one place left — the games-played number read as the team's name.
     */
    const line = raw.replace(/\s+$/, "");

    if (!header) {
      const found = readHeader(line);
      if (found) {
        header = found;
        continue;
      }
    }

    if (header) {
      const parsed = readCanonicalRow(cells(line), header, options);
      if (parsed) matches.push(parsed);
      else skipped.push(line);
      continue;
    }

    const columns = cells(line).filter((c) => c !== "");
    if (columns.length === 0) continue;

    // A header row is not a fixture and not a dropped one either. Checked
    // before anything else, because "HOME TEAM" and "AWAY TEAM" are two
    // perfectly good team names as far as the rest of this can tell.
    if (columns.every((c) => HEADER.test(c))) continue;

    // A line that is only a date is a heading, and every row under it belongs
    // to that day — the way every platform lays a schedule out. "42 Games"
    // often rides along on the same line, so a two-cell line counts too.
    if (columns.length <= 2) {
      const heading = parsePastedDate(line, options.year);
      if (heading) {
        date = heading;
        continue;
      }
      skipped.push(line);
      continue;
    }

    const parsed = readRow(columns, date, options);
    if (parsed) matches.push(parsed);
    else skipped.push(line);
  }

  return { matches, skipped };
}

function readRow(
  columns: string[],
  date: string | null,
  options: PasteOptions,
): PastedMatch | null {
  let time: string | null = null;
  let group: string | null = null;
  let division: string | null = null;
  let pairScore: [number, number] | null = null;
  const words: string[] = [];
  const numbers: { index: number; value: number }[] = [];

  columns.forEach((cell) => {
    // The first cell of an EventConnect row packs three things: the kick-off,
    // the slot ("A1 vs A4") and the division. Take them in that order and
    // whatever is left is the division's name.
    if (!time) {
      const t = parsePastedTime(cell);
      if (t) {
        time = t;
        const rest = cell
          .replace(/\b\d{1,2}:\d{2}\s*([ap]\.?m\.?)?/i, " ")
          .replace(/\s+/g, " ")
          .trim();
        const slot = rest.match(/^([A-Z]?\d+\s+vs\.?\s+[A-Z]?\d+)\s*(.*)$/i);
        if (slot) {
          group = bracketOf(slot[1]);
          if (slot[2].trim()) division = slot[2].trim();
        } else if (rest) {
          division = rest;
        }
        return;
      }
    }

    if (!pairScore) {
      const s = parsePastedScore(cell);
      if (s) {
        pairScore = s;
        return;
      }
    }

    const n = parseScoreCell(cell);
    if (n !== null) {
      numbers.push({ index: words.length, value: n });
      return;
    }

    if (VERSUS.test(cell)) return;
    if (/[a-z]/i.test(cell)) words.push(cell);
  });

  // A fixture is two teams. A row we cannot find two on is refused rather
  // than invented — the placeholder finals ("Boys U10 Red - (1st Place)")
  // are still words, so they survive this.
  if (words.length < 2) return null;

  const [home, away] = words;
  const field = words.slice(2).join(" · ") || null;

  /*
   * Two bare numbers between the team names are the score, the way this
   * table prints it: home | 1 | 7 | away. Anywhere else they are shirt
   * numbers or seeds, so they are ignored rather than read as a result.
   */
  const between = numbers.filter((n) => n.index === 1);
  const [homeScore, awayScore] = pairScore ??
    (between.length === 2 ? [between[0].value, between[1].value] : [null, null]);

  return {
    division: division ?? options.division,
    date,
    time,
    group,
    field,
    home,
    away,
    homeScore,
    awayScore,
  };
}

/**
 * A name that stands for whoever finishes somewhere, not for a team.
 *
 * "Boys U13 Blue - Group A - (1st Place)" is a real row on a real schedule,
 * and turning it into a team would put a phantom in the standings and in
 * every team list on the site.
 */
export function isPlaceholderName(name: string): boolean {
  return /\((?:1st|2nd|3rd|4th)\s+place\)|^\s*(winner|loser|tbd)\b/i.test(name);
}

/** A key that survives a re-paste, so the same game updates rather than doubles. */
function matchKey(m: PastedMatch): string {
  // Not the time: a kick-off that moves between fields is the same fixture,
  // and re-keying it would delete the old row and lose nothing but confuse
  // anyone watching the id.
  return [m.division, m.date ?? "tbd", m.home, m.away].join("|").toLowerCase();
}

/**
 * What makes a team one team, within one pasted event.
 *
 * The name alone, deliberately. Keyed by division as well, a side that plays
 * a group stage and then a championship bracket arrives under two division
 * headings and becomes two teams: "boys u10|lwpfc bu10 white bichirs" and
 * "boys u10 championships|lwpfc bu10 white bichirs" were two rows for one
 * club side, and that pattern accounted for 54 duplicate groups in
 * production, every one of them a bracket.
 *
 * The cost is that a team can hold one division per event — event_teams is
 * unique on (event, team) — so the first division a team appears in is the
 * one it keeps. Names in these schedules carry the age group, so two teams
 * sharing a name across divisions of one tournament are the same side.
 */
function teamKey(name: string): string {
  return name.trim().toLowerCase();
}

/**
 * Turn parsed rows into the shape the sync writer already takes.
 *
 * Same destination as a connector's output, so a pasted schedule renders
 * through the same page, with the same divisions, standings and matchday
 * navigation. The only difference is who fetched it.
 */
export function toSyncedEvent(matches: PastedMatch[]): SyncedEvent {
  const teams = new Map<string, SyncedTeam>();

  for (const m of matches) {
    for (const name of [m.home, m.away]) {
      if (isPlaceholderName(name)) continue;
      const key = teamKey(name);
      if (!teams.has(key)) {
        teams.set(key, {
          sourceTeamId: key,
          name,
          division: m.division,
          group: m.group,
        });
      }
    }
  }

  const seen = new Set<string>();
  const synced: SyncedMatch[] = [];

  for (const m of matches) {
    // A repeated key inside one paste is the same row pasted twice.
    const key = matchKey(m);
    if (seen.has(key)) continue;
    seen.add(key);

    const homeKey = teamKey(m.home);
    const awayKey = teamKey(m.away);

    synced.push({
      sourceMatchId: key,
      division: m.division,
      group: m.group,
      date: m.date,
      time: m.time,
      homeTeamId: teams.has(homeKey) ? homeKey : null,
      awayTeamId: teams.has(awayKey) ? awayKey : null,
      homeName: m.home,
      awayName: m.away,
      homeScore: m.homeScore,
      awayScore: m.awayScore,
      field: m.field,
      venue: null,
    });
  }

  return {
    source: { platform: "manual", eventId: "pasted" },
    teams: [...teams.values()],
    matches: synced,
  };
}

/** A row from a paste that named its own columns. Nothing is inferred here. */
function readCanonicalRow(
  columns: string[],
  header: Map<Canonical, number>,
  options: PasteOptions,
): PastedMatch | null {
  const at = (key: Canonical) => {
    const i = header.get(key);
    return i === undefined ? "" : (columns[i] ?? "").trim();
  };

  const home = at("home");
  const away = at("away");
  if (!home || !away) return null;

  const score = (key: Canonical) => {
    const m = at(key).match(/^(\d{1,3})$/);
    return m ? Number(m[1]) : null;
  };

  const field = [at("field"), at("venue")].filter(Boolean).join(" · ") || null;

  return {
    division: at("division") || options.division,
    date: at("date") ? parsePastedDate(at("date"), options.year) : null,
    time: parsePastedTime(at("time")),
    group: bracketOf(at("slot")),
    field,
    home,
    away,
    homeScore: score("home_score"),
    awayScore: score("away_score"),
  };
}
