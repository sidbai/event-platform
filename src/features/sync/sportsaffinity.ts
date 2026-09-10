/**
 * Reading a league published on Sports Affinity — the Regional Club League.
 *
 * Their pages are server-rendered and answer a plain request in full, which
 * puts this in the same class as Athletes2Events rather than the platforms
 * that need a browser. What it is not is modern markup: the layout is nested
 * tables from the era that produced them, and a fixture's date is not in its
 * row at all — it is in a heading above a run of rows, the way a printed
 * fixture list is laid out.
 *
 * So the page is read in segments rather than by walking the tree. Split on
 * the headings, and each segment's rows belong to the date in the heading
 * that opened it. Fighting the nesting to establish the same thing would be
 * more code and more ways to be wrong.
 *
 * The parsing is pure and separate from the fetching, so it can be tested
 * against a saved copy of a real page.
 */
import { parse } from "node-html-parser";

import type {
  ExternalEventProvider,
  SourceRef,
  SyncedMatch,
  SyncedTeam,
} from "./provider";

const HOST = "sportsaffinity.com";

const MONTHS = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];

/**
 * "Bracket - Saturday,  September 12, 2026" → "2026-09-12".
 *
 * Two spaces after the comma in the real pages, and the word before the
 * weekday varies by flight, so neither is matched on.
 */
const HEADING =
  /(?:Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday),\s*([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})/g;

function isoDate(month: string, day: string, year: string): string | null {
  const m = MONTHS.indexOf(month.toLowerCase());
  if (m < 0) return null;
  return `${year}-${String(m + 1).padStart(2, "0")}-${day.padStart(2, "0")}`;
}

/** "09:00 AM" → "09:00"; "--" and anything else → null. */
function time24(raw: string): string | null {
  const m = raw.trim().match(/^(\d{1,2}):(\d{2})\s*([AP])M$/i);
  if (!m) return null;
  let hour = Number(m[1]) % 12;
  if (m[3].toUpperCase() === "P") hour += 12;
  return `${String(hour).padStart(2, "0")}:${m[2]}`;
}

/**
 * A cell the platform filled in with a placeholder.
 *
 * "--" for a time or a pitch not yet set, and "Virtual TBD" for a venue,
 * which is what most of a season looks like before the fields are booked.
 */
function real(raw: string): string | null {
  const v = raw.trim();
  if (!v || v === "--" || /^virtual tbd$/i.test(v)) return null;
  return v;
}

export type RclRow = {
  gameId: string;
  date: string;
  time: string | null;
  venue: string | null;
  field: string | null;
  group: string | null;
  home: string;
  away: string;
  homeScore: number | null;
  awayScore: number | null;
};

/**
 * The fixtures on one flight's page.
 *
 * A row is ten cells: game, venue, time, field, group, home, score, "vs.",
 * away, score. Read by position within the row, because they carry no classes
 * of their own — but only inside a table whose header row does, which is what
 * keeps the standings grid above from being read as fixtures.
 */
export function readRclFlight(html: string): RclRow[] {
  const out: RclRow[] = [];

  // Where each date heading starts, so a segment can be cut at the next one.
  const marks: { at: number; date: string }[] = [];
  HEADING.lastIndex = 0;
  for (const m of html.matchAll(HEADING)) {
    const date = isoDate(m[1], m[2], m[3]);
    if (date && m.index !== undefined) marks.push({ at: m.index, date });
  }

  for (const [i, mark] of marks.entries()) {
    const segment = html.slice(mark.at, marks[i + 1]?.at ?? html.length);
    const root = parse(segment);

    for (const table of root.querySelectorAll("table")) {
      // The header row names itself; the standings grid above does not.
      if (!table.querySelector("td.theadb")) continue;

      for (const tr of table.querySelectorAll("tr")) {
        const cells = tr.querySelectorAll("td").map((c) => c.text.replace(/\s+/g, " ").trim());
        if (cells.length < 10) continue;
        // The header row repeats above every day's fixtures.
        if (!/^\d+$/.test(cells[0])) continue;

        const home = cells[5];
        const away = cells[8];
        if (!home || !away) continue;

        out.push({
          gameId: cells[0],
          date: mark.date,
          time: time24(cells[2]),
          venue: real(cells[1]),
          field: real(cells[3]),
          group: real(cells[4]),
          home,
          away,
          homeScore: /^\d+$/.test(cells[6]) ? Number(cells[6]) : null,
          awayScore: /^\d+$/.test(cells[9]) ? Number(cells[9]) : null,
        });
      }
    }
  }

  return out;
}

/**
 * A fixture one of whose sides is a slot rather than a club.
 *
 * "A11 vs A7" in the group column and "A11" in the team column: the league
 * has scheduled the game — some of these carry a real time and a real ground
 * — but has not yet said which club is in that slot. Read literally it makes
 * a team called A11, which would sit in the directory beside real clubs, be
 * bound to the A11 of every other flight, and appear as somebody's opponent.
 *
 * So the fixture is dropped until the slot is filled, and the next sync picks
 * it up when it is. What is lost is a row that could have read "Valor Soccer
 * BU11 White v TBD" on one team's page; showing that means a fixture with one
 * side missing, which nothing here carries yet. Worth doing, and bigger than
 * this.
 */
export function isSlot(name: string, group: string | null): boolean {
  const own = name.trim();
  if (own === "") return true;
  const slots = (group ?? "").split(/\s+vs\.?\s+/i).map((s) => s.trim());
  if (slots.length > 1 && slots.some((s) => s.toLowerCase() === own.toLowerCase())) return true;
  // No group to check against — a bare slot code is one all the same.
  return group === null && /^[A-Z]\d{1,2}$/.test(own);
}

/**
 * A group name, where that column holds one.
 *
 * It usually does not. Sports Affinity puts the bracket pairing there —
 * "A6 vs A4", meaning the side in slot A6 plays the one in slot A4 — which is
 * how the league builds a fixture list, not something anybody calls a group.
 * Published as-is it printed "Bracket A6 vs A4" over every one of four
 * thousand fixtures, on the line a parent reads to find their child's game.
 *
 * The same column is what tells a slot from a club, so it is still read; this
 * only decides what is worth passing on. A flight that does name its groups
 * keeps them.
 */
export function groupName(raw: string | null): string | null {
  if (!raw) return null;
  return /^\s*\S+\s+vs\.?\s+\S+\s*$/i.test(raw) ? null : raw;
}

/** The fixtures with both sides known. */
export function played(rows: RclRow[]): RclRow[] {
  return rows.filter((r) => !isSlot(r.home, r.group) && !isSlot(r.away, r.group));
}

export type RclFlight = { flightguid: string; agecode: string };

/**
 * The flights a tournament's accepted-teams page links to.
 *
 * One page per gender, and every flight on it appears as an accepted_flight
 * link carrying both its id and its age code — which is the only place the
 * age is written down in a form worth reading. The schedule page itself only
 * says "Boys Under 8" in a heading.
 */
export function readFlightList(html: string): RclFlight[] {
  const seen = new Map<string, string>();
  const re = /accepted_flight\.asp\?sessionguid=&agecode=([^&"']+)&flightguid=([0-9A-F-]{36})/gi;
  for (const m of html.matchAll(re)) {
    if (!seen.has(m[2])) seen.set(m[2], m[1]);
  }
  return [...seen].map(([flightguid, agecode]) => ({ flightguid, agecode }));
}

const BASE = "https://wys.sportsaffinity.com/tour/public/info";

export function flightListUrl(tournamentguid: string, show: "boys" | "girls"): string {
  return `${BASE}/accepted_list.asp?sessionguid=&tournamentguid=${tournamentguid}&show=${show}`;
}

export function flightScheduleUrl(tournamentguid: string, flightguid: string): string {
  return `${BASE}/schedule_results2.asp?sessionguid=&flightguid=${flightguid}&tournamentguid=${tournamentguid}`;
}

/**
 * A team's identity, which the platform does not give us.
 *
 * No ids anywhere in the markup, and a name is only unique within its flight:
 * every age group has an "Eastside F.C." Keyed by flight for the same reason
 * Modular11's are keyed by division.
 */
export function teamsOf(rows: RclRow[], division: string): SyncedTeam[] {
  const seen = new Map<string, SyncedTeam>();
  for (const row of rows) {
    for (const name of [row.home, row.away]) {
      const key = `${division}::${name}`;
      if (!seen.has(key)) seen.set(key, { sourceTeamId: key, name, division, group: null });
    }
  }
  return [...seen.values()];
}

export function matchesOf(rows: RclRow[], division: string): SyncedMatch[] {
  return rows.map((row) => ({
    sourceMatchId: row.gameId,
    division,
    group: groupName(row.group),
    date: row.date,
    time: row.time,
    homeTeamId: `${division}::${row.home}`,
    awayTeamId: `${division}::${row.away}`,
    homeName: row.home,
    awayName: row.away,
    homeScore: row.homeScore,
    awayScore: row.awayScore,
    field: row.field,
    venue: row.venue,
  }));
}

/**
 * One polite request, named so their logs can tell who we are.
 *
 * A browser's user agent, unlike everywhere else in this codebase, and it is
 * worth saying why rather than leaving it to be discovered: the site sits
 * behind Imperva, which serves some clients a challenge instead of a page.
 * Ours is answered in full — but that is a thing to keep checking rather than
 * to assume, and the identifying comment in the string is what a log reader
 * has to go on.
 */
async function get(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      "user-agent":
        "Mozilla/5.0 (compatible; KingJuanSoccerBot/1.0; +https://kingjuansoccer.com)",
      accept: "text/html",
    },
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.text();
}

/** The tournament id out of any of their public pages. */
export function parseSportsAffinityUrl(url: string): SourceRef | null {
  try {
    const u = new URL(url);
    if (!u.hostname.toLowerCase().endsWith(HOST)) return null;
    /*
     * Case-insensitively, because their own pages disagree: the accepted-teams
     * link says "Tournamentguid" and the schedule link says "tournamentguid",
     * and either is what somebody will paste. The braces come off for the
     * same reason — one page writes the guid inside them.
     */
    const key = [...u.searchParams.keys()].find(
      (k) => k.toLowerCase() === "tournamentguid",
    );
    const guid = key ? u.searchParams.get(key)?.replace(/[{}]/g, "") : undefined;
    if (!guid || !/^[0-9A-F-]{36}$/i.test(guid)) return null;
    return { platform: "sportsaffinity", eventId: guid.toUpperCase() };
  } catch {
    return null;
  }
}

/** Between requests. Fifty flights is fifty pages; none of them is urgent. */
const PAUSE_MS = 1000;

export const sportsaffinity: ExternalEventProvider = {
  platform: "sportsaffinity",

  matches(url) {
    return parseSportsAffinityUrl(url) !== null;
  },

  parseUrl(url) {
    return parseSportsAffinityUrl(url);
  },

  async fetch(ref) {
    const teams: SyncedTeam[] = [];
    const matches: SyncedMatch[] = [];

    try {
      const flights: RclFlight[] = [];
      for (const show of ["boys", "girls"] as const) {
        flights.push(...readFlightList(await get(flightListUrl(ref.eventId, show))));
        await new Promise((r) => setTimeout(r, PAUSE_MS));
      }

      if (flights.length === 0) {
        return {
          ok: false,
          error: {
            kind: "unrecognised",
            detail: "no flights on either accepted-teams page — their markup or the id may have changed",
          },
        };
      }

      for (const flight of flights) {
        const rows = played(readRclFlight(await get(flightScheduleUrl(ref.eventId, flight.flightguid))));
        /*
         * The age code is the division, because it is the only name the
         * platform gives a flight that is worth reading — the page's own
         * heading says "Boys Under 8" and the standings grid says "Group A".
         */
        teams.push(...teamsOf(rows, flight.agecode));
        matches.push(...matchesOf(rows, flight.agecode));
        await new Promise((r) => setTimeout(r, PAUSE_MS));
      }
    } catch (e) {
      return {
        ok: false,
        error: { kind: "unreachable", detail: e instanceof Error ? e.message : String(e) },
      };
    }

    if (matches.length === 0) {
      return {
        ok: false,
        error: { kind: "unrecognised", detail: "flights found but no fixtures in any of them" },
      };
    }

    return { ok: true, data: { source: ref, teams, matches } };
  },
};

export const SPORTS_AFFINITY_HOST = HOST;
