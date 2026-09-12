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
  StepResult,
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

export type RclFlight = {
  flightguid: string;
  agecode: string;
  /** "BU08 Div 3 North" — the flight as the platform names it, made short. */
  division: string;
};

/**
 * What to call a flight: its age code and its tier.
 *
 * The accepted-teams page writes "Boys Under 8 (2018/19) Div 3 North", and
 * the age code already says the first half of that. What is left — "Div 3
 * North" — is the thing the age code does not say, and the thing a season
 * of fixtures was being filed without: fifty flights landed as eighteen
 * divisions, one per age, and every table under them was a merge of three
 * or four leagues that never play each other.
 *
 * A name that does not read this way is kept whole after the age code, so
 * a flight the platform names some new way is still told apart from its
 * neighbours rather than folded into them.
 */
export function divisionName(agecode: string, flightName: string): string {
  const years = flightName.match(/\(\d{4}\/\d{2,4}\)\s*(.*)$/);
  const tail = (years ? years[1] : flightName.replace(/^(boys|girls)\s+under\s+\d+\s*/i, "")).trim();
  return tail ? `${agecode} ${tail}` : agecode;
}

/**
 * The flights a tournament's accepted-teams page links to.
 *
 * One page per gender, and every flight on it is a row: its name in the
 * first cell, then an accepted_flight link carrying both its id and its age
 * code — which is the only place the age is written down in a form worth
 * reading. The schedule page itself only says "Boys Under 8" in a heading.
 */
export function readFlightList(html: string): RclFlight[] {
  const seen = new Map<string, RclFlight>();
  const re = /accepted_flight\.asp\?sessionguid=&agecode=([^&"']+)&flightguid=([0-9A-F-]{36})/gi;
  for (const m of html.matchAll(re)) {
    if (seen.has(m[2])) continue;
    const agecode = m[1];
    // The row this link sits in, and the first cell of it.
    const row = html.slice(html.lastIndexOf("<tr", m.index), m.index);
    const cell = row.match(/<td[^>]*>([\s\S]*?)<\/td>/);
    const name = cell ? cell[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() : "";
    seen.set(m[2], { flightguid: m[2], agecode, division: divisionName(agecode, name) });
  }
  return [...seen.values()];
}

const BASE = "https://wys.sportsaffinity.com/tour/public/info";

export function flightListUrl(tournamentguid: string, show: "boys" | "girls"): string {
  return `${BASE}/accepted_list.asp?sessionguid=&tournamentguid=${tournamentguid}&show=${show}`;
}

export function flightScheduleUrl(tournamentguid: string, flightguid: string): string {
  return `${BASE}/schedule_results2.asp?sessionguid=&flightguid=${flightguid}&tournamentguid=${tournamentguid}`;
}

export function acceptedFlightUrl(tournamentguid: string, agecode: string, flightguid: string): string {
  return `${BASE}/accepted_flight.asp?sessionguid=&agecode=${agecode}&flightguid=${flightguid}&tournamentguid=${tournamentguid}`;
}

/**
 * One team as the flight's accepted-teams page lists it.
 *
 * The page the schedule does not have: for every slot in the flight, the
 * club the league registered the side under, the side's name, the league's
 * own numeric id for it (blank for two teams in three), and the head coach.
 * The schedule page names teams by the second line of that cell, exactly,
 * and by the slot in its group column — so a fixture's side can be joined
 * to its coach either way.
 */
export type RclEntry = {
  /** "A1" — the slot the schedule's group column refers to. */
  slot: string;
  /** "Eastside F.C." — the club as the league has it, not as the name says. */
  club: string | null;
  /** "Eastside F.C. - BU10 Red" — the name the schedule uses. */
  name: string;
  /** Their id for the team, where the club registered one. */
  platformTeamId: string | null;
  coach: string | null;
};

/**
 * The entries on a flight's accepted-teams page.
 *
 * One table, class "report", a header row of four labelled cells and then
 * a row per team. The club and the team share a cell, split by a line
 * break, which is the only thing that tells them apart — read as text they
 * run together into "Seattle United Seattle United B16 Copa". "n/a" in the
 * id column means the club registered no id, not an id of "n/a".
 */
export function readAcceptedFlight(html: string): RclEntry[] {
  const out: RclEntry[] = [];
  const root = parse(html);
  for (const table of root.querySelectorAll("table.report")) {
    const head = table.querySelector("td.reporthead");
    if (!head || !/group/i.test(head.text)) continue;
    for (const tr of table.querySelectorAll("tr")) {
      const cells = tr.querySelectorAll("td");
      if (cells.length < 4 || cells[0].classList.contains("reporthead")) continue;
      const slot = cells[0].text.replace(/\s+/g, " ").trim();
      if (!/^[A-Z]\d{1,2}$/.test(slot)) continue;
      const lines = cells[1].innerHTML
        .split(/<br\s*\/?>/i)
        .map((l) => parse(l).text.replace(/\s+/g, " ").trim())
        .filter(Boolean);
      const name = lines[lines.length - 1];
      if (!name) continue;
      const id = cells[2].text.replace(/\s+/g, " ").trim();
      const coach = cells[3].text.replace(/\s+/g, " ").trim();
      out.push({
        slot,
        club: lines.length > 1 ? lines[0] : null,
        name,
        platformTeamId: /^\d+$/.test(id) ? id : null,
        coach: coach && !/^(n\/a|tbd|-+)$/i.test(coach) ? coach : null,
      });
    }
  }
  return out;
}

/**
 * A team's identity, which the platform does not give us.
 *
 * No ids anywhere in the markup, and a name is only unique within its age:
 * every age group has an "Eastside F.C." Keyed by the age code, and it has
 * to stay that way — the key is what a synced team's entry is remembered
 * by, and a season's teams were written under it before the flight became
 * the division. Re-keying them by flight would make every one of them a
 * stranger to its own entry and land a second copy beside it.
 *
 * The division is the flight; the key is not. They are passed apart.
 */
export function teamsOf(
  rows: RclRow[],
  agecode: string,
  division = agecode,
  entries: RclEntry[] = [],
): SyncedTeam[] {
  /*
   * The entries page, joined two ways: by the name the schedule prints,
   * which is the entry's second line verbatim, and failing that by the slot
   * the schedule's group column names ("A11 vs A7" puts the home side in
   * A11). A side whose name the league has since respelled still finds its
   * coach through the slot.
   */
  const byName = new Map(entries.map((e) => [e.name, e]));
  const bySlot = new Map(entries.map((e) => [e.slot, e]));
  const seen = new Map<string, SyncedTeam>();
  for (const row of rows) {
    const slots = row.group?.match(/^([A-Z]\d{1,2})\s+vs\.?\s+([A-Z]\d{1,2})$/i);
    const sides: [string, string | undefined][] = [
      [row.home, slots?.[1]],
      [row.away, slots?.[2]],
    ];
    for (const [name, slot] of sides) {
      const key = `${agecode}::${name}`;
      if (seen.has(key)) continue;
      const entry = byName.get(name) ?? (slot ? bySlot.get(slot.toUpperCase()) : undefined);
      seen.set(key, {
        sourceTeamId: key,
        name,
        division,
        group: null,
        ...(entry
          ? { club: entry.club, coach: entry.coach, platformTeamId: entry.platformTeamId }
          : {}),
      });
    }
  }
  return [...seen.values()];
}

export function matchesOf(rows: RclRow[], agecode: string, division = agecode): SyncedMatch[] {
  return rows.map((row) => ({
    sourceMatchId: row.gameId,
    division,
    group: groupName(row.group),
    date: row.date,
    time: row.time,
    homeTeamId: `${agecode}::${row.home}`,
    awayTeamId: `${agecode}::${row.away}`,
    homeName: row.home,
    awayName: row.away,
    homeScore: row.homeScore,
    awayScore: row.awayScore,
    field: row.field,
    venue: row.venue,
  }));
}

/**
 * What we call ourselves, which is now just ourselves.
 *
 * This began "Mozilla/5.0 (compatible; KingJuanSoccerBot/1.0; …)". The
 * browser prefix was not a lie — the string says who we are and how to reach
 * us — but it was there to get past the thing in front of the site, and a
 * string shaped to pass a check is a string written for the check rather than
 * for the log reader. Dropped, at the cost of being easier to refuse.
 *
 * It also has to be true for the other half of this to work: asking Washington
 * Youth Soccer to let a named reader through is a conversation you can only
 * have if the name in their logs is the one you are asking about.
 */
const AGENT =
  "KingJuanSoccerBot/1.0 (+https://kingjuansoccer.com; youth soccer event directory)";

/**
 * One session, not fifty-two strangers.
 *
 * Node's fetch keeps nothing between calls, so every request arrived with no
 * cookies — which is not what a reader looks like to anything sitting in
 * front of a site, and is part of why fifty-two of them in seventy-three
 * seconds ended in a challenge page. Whatever they set, we send back: this is
 * a plain HTTP client doing what a plain HTTP client does, and nothing here
 * makes up a value they did not give us.
 */
class Session {
  private jar = new Map<string, string>();

  private take(res: Response) {
    for (const line of res.headers.getSetCookie()) {
      const [pair] = line.split(";");
      const eq = pair.indexOf("=");
      if (eq > 0) this.jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
    }
  }

  private header(): string | undefined {
    if (this.jar.size === 0) return undefined;
    return [...this.jar].map(([k, v]) => `${k}=${v}`).join("; ");
  }

  async get(url: string, want: "flights" | "schedule" | "entries"): Promise<string> {
    const cookie = this.header();
    const res = await fetch(url, {
      headers: { "user-agent": AGENT, accept: "text/html", ...(cookie ? { cookie } : {}) },
    });
    this.take(res);
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    const html = await res.text();
    if (!arrived(html, want)) throw new Error(`no ${want} in the page at ${url}`);
    return html;
  }

  /**
   * A refusal is worth waiting out once or twice.
   *
   * The block is not absolute — the same fifty-two requests read the whole
   * league on Tuesday and half of it on Wednesday — so it is a rate somebody
   * is over rather than a door that is shut. Backing off and asking again is
   * the polite reading of that, and giving up after three is what stops it
   * becoming a way of hammering them until they relent.
   */
  async patiently(url: string, want: "flights" | "schedule" | "entries"): Promise<string> {
    let last: unknown;
    for (const wait of [0, BACKOFF_MS, BACKOFF_MS * 4]) {
      if (wait > 0) await pause(wait);
      try {
        return await this.get(url, want);
      } catch (e) {
        last = e;
      }
    }
    throw last;
  }
}

/**
 * Whether the page we asked for is the page that came back.
 *
 * Imperva sits in front of this site and sometimes answers with a challenge
 * instead: 200, eighty kilobytes of markup, nothing in it. The parser finds no
 * fixtures, which is indistinguishable from an age group that has none — and
 * that read the boys half of the Regional Club League as empty and deleted
 * 3,129 fixtures.
 *
 * The first attempt at catching it looked for Imperva's name in the markup.
 * That is on every page they serve, good or bad, so it condemned all of them.
 * A blocker cannot be identified by what it looks like; what can be checked is
 * whether the thing we came for is here. A flight list has links to flights. A
 * schedule has the class their fixture tables put on a header row.
 *
 * A flight with genuinely no fixtures published would fail this too, and that
 * is the right way round: a loud failure costs a week of staleness, and the
 * quiet one cost most of a season.
 */
export function arrived(html: string, want: "flights" | "schedule" | "entries"): boolean {
  if (want === "flights") return html.includes("accepted_flight.asp");
  if (want === "entries") return html.includes("reporthead");
  return html.includes("theadb");
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

/**
 * Between requests. Fifty flights is fifty pages; none of them is urgent.
 *
 * Raised from one second after a run of fifty-two at that rate came back as a
 * challenge page. Nothing here needs to be quick — this league is read once a
 * week, on a Monday morning, and the difference between one minute and four
 * is invisible to everybody except the server being read.
 */
const PAUSE_MS = 2500;

/** After a refusal, before asking again. */
const BACKOFF_MS = 20_000;

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * One flight: its fixtures, and its accepted-teams page for the head coach
 * and the club the league registered each side under. Two requests at the
 * usual pace.
 *
 * The second is loud when it fails, like the first. The first version
 * swallowed it, on the thought that a week without coaches costs less than
 * a week without games — and the first production read came back with 446
 * entries and no coach on any of them, and nothing to say whether the page
 * was refused, unrecognised, or never asked for. A quiet failure is the one
 * this connector has already paid for.
 */
async function readFlight(
  session: Session,
  tournamentguid: string,
  flight: RclFlight,
): Promise<{ teams: SyncedTeam[]; matches: SyncedMatch[] }> {
  const rows = played(
    readRclFlight(
      await session.patiently(flightScheduleUrl(tournamentguid, flight.flightguid), "schedule"),
    ),
  );
  await pause(PAUSE_MS);
  const entries = readAcceptedFlight(
    await session.patiently(
      acceptedFlightUrl(tournamentguid, flight.agecode, flight.flightguid),
      "entries",
    ),
  );
  await pause(PAUSE_MS);
  /*
   * The flight is the division — "BU08 Div 3 North" — read off the
   * accepted-teams page, since the schedule page's own heading only says
   * "Boys Under 8" and the standings grid says "Group A". The age code
   * stays the key teams are remembered by; see teamsOf.
   */
  return {
    teams: teamsOf(rows, flight.agecode, flight.division, entries),
    matches: matchesOf(rows, flight.agecode, flight.division),
  };
}

/**
 * Both accepted-teams pages, which every read needs first.
 *
 * Each half has to answer, and answer with flights. Both genders always
 * have some. A list that comes back empty is a page that did not arrive —
 * the shape this connector has already been caught by — and carrying on
 * with the other half publishes half a league as the whole of it.
 */
async function readFlightLists(session: Session, tournamentguid: string): Promise<RclFlight[]> {
  const flights: RclFlight[] = [];
  for (const show of ["boys", "girls"] as const) {
    const found = readFlightList(
      await session.patiently(flightListUrl(tournamentguid, show), "flights"),
    );
    if (found.length === 0) {
      throw new Unrecognised(
        `no flights on the ${show} accepted-teams page — it did not arrive, or their markup changed`,
      );
    }
    flights.push(...found);
    await pause(PAUSE_MS);
  }
  return flights;
}

/** A page that arrived and said nothing we understand, as against one that did not arrive. */
class Unrecognised extends Error {}

function failure(e: unknown): { kind: "unreachable" | "unrecognised"; detail: string } {
  const detail = e instanceof Error ? e.message : String(e);
  return { kind: e instanceof Unrecognised ? "unrecognised" : "unreachable", detail };
}

/** Where a paged read of this league is: the flights, and the next one to read. */
type RclCursor = { flights: RclFlight[]; index: number };

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
      const session = new Session();
      const flights = await readFlightLists(session, ref.eventId);
      for (const flight of flights) {
        const read = await readFlight(session, ref.eventId, flight);
        teams.push(...read.teams);
        matches.push(...read.matches);
      }
    } catch (e) {
      return { ok: false, error: failure(e) };
    }

    if (matches.length === 0) {
      return {
        ok: false,
        error: { kind: "unrecognised", detail: "flights found but no fixtures in any of them" },
      };
    }

    return { ok: true, data: { source: ref, teams, matches } };
  },

  /*
   * The same read, one flight per step, for the job runner.
   *
   * The first step reads the two flight lists and nothing else, so the
   * total is known before any fixture is; each step after reads one
   * flight's two pages. The cursor is the flight list and an index, which
   * is plain data and survives being stored between invocations. A fresh
   * Session each time: the cookies the site sets come with the first page
   * of any step, and a session is not something a cursor can hold.
   */
  async step(ref, cursor): Promise<StepResult> {
    const session = new Session();
    try {
      if (!cursor) {
        const flights = await readFlightLists(session, ref.eventId);
        const at: RclCursor = { flights, index: 0 };
        return {
          ok: true,
          step: {
            cursor: at,
            part: { teams: [], matches: [] },
            done: flights.length === 0,
            index: 0,
            total: flights.length,
            label: `${flights.length} flights listed`,
          },
        };
      }
      const at = cursor as RclCursor;
      const flight = at.flights[at.index];
      if (!flight) {
        return {
          ok: true,
          step: {
            cursor: at,
            part: { teams: [], matches: [] },
            done: true,
            index: at.index,
            total: at.flights.length,
            label: null,
          },
        };
      }
      const read = await readFlight(session, ref.eventId, flight);
      const index = at.index + 1;
      const next: RclCursor = { flights: at.flights, index };
      return {
        ok: true,
        step: {
          cursor: next,
          part: read,
          done: index >= at.flights.length,
          index,
          total: at.flights.length,
          label: flight.division,
        },
      };
    } catch (e) {
      return { ok: false, error: failure(e) };
    }
  },
};

export const SPORTS_AFFINITY_HOST = HOST;
