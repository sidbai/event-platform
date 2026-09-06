/**
 * Reading a tournament published on Athletes2Events.
 *
 * Their schedule pages are server-rendered tables, one per flight, and their
 * robots.txt disallows /admin/, /super/, /college-coach/ and their own /api/
 * before allowing everything else — so the pages this reads are the ones they
 * publish for people to read, and somebody there decided which those were.
 *
 * The parsing is pure and separate from the fetching, so it can be tested
 * against a saved copy of a real page rather than against the live site. That
 * matters more here than almost anywhere else in this codebase: the input is
 * somebody else's markup, it will change without warning, and the failure
 * this must never have is a quiet one.
 */
import { parse, type HTMLElement } from "node-html-parser";

import type {
  ExternalEventProvider,
  SourceRef,
  SyncResult,
  SyncedMatch,
  SyncedTeam,
} from "./provider";

const HOST = "athletes2events.com";

/**
 * One polite request.
 *
 * Named so their logs can tell who we are and reach us — a directory reading
 * somebody's public pages should be identifiable, not anonymous traffic they
 * have to guess about.
 */
async function get(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      "user-agent":
        "KingJuanSoccerBot/1.0 (+https://kingjuansoccer.com; youth soccer event directory)",
      accept: "text/html",
    },
    // A sync that hangs holds a serverless invocation open until it is killed.
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

/** Text of a cell, with the whitespace their template leaves behind. */
const text = (el: HTMLElement | null | undefined) =>
  (el?.text ?? "").replace(/\s+/g, " ").trim();

/** `…?team-id=3259` → `3259`. The name changes between syncs; this does not. */
function teamIdFrom(cell: HTMLElement | null): string | null {
  const href = cell?.querySelector("a")?.getAttribute("href") ?? "";
  return new URL(href, "https://example.invalid").searchParams.get("team-id");
}

/** `7 - 0` → `[7, 0]`. Anything else — "vs", a blank, a forfeit note — is no score. */
export function parseScore(raw: string): [number, number] | null {
  const m = raw.match(/^(\d{1,3})\s*-\s*(\d{1,3})$/);
  if (!m) return null;
  return [Number(m[1]), Number(m[2])];
}

/**
 * `Sat Sep 05, 2026` → `2026-09-05`.
 *
 * Returned as a plain date rather than an instant: the page publishes a wall
 * clock in the tournament's own city, and turning that into a moment needs
 * the event's timezone, which belongs to the caller and not to a parser.
 */
export function parseHeadingDate(raw: string): string | null {
  const m = raw.match(/(\w{3})\s+(\w{3})\s+(\d{1,2}),\s*(\d{4})/);
  if (!m) return null;
  const months = "JanFebMarAprMayJunJulAugSepOctNovDec";
  const month = months.indexOf(m[2]) / 3 + 1;
  if (month < 1) return null;
  return `${m[4]}-${String(month).padStart(2, "0")}-${m[3].padStart(2, "0")}`;
}

/** `09:05 AM` → `09:05`. */
export function parseTime(raw: string): string | null {
  const m = raw.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!m) return null;
  let hour = Number(m[1]) % 12;
  if (m[3].toUpperCase() === "PM") hour += 12;
  return `${String(hour).padStart(2, "0")}:${m[2]}`;
}

/**
 * Every match on one flight's schedule page.
 *
 * Rows are grouped under date headings, so the date comes from the last
 * heading seen rather than from the row itself.
 *
 * Throws when it cannot find a schedule table at all. That is the difference
 * between "this flight has no fixtures yet", which is a normal empty list,
 * and "their markup changed", which must stop a sync rather than quietly
 * empty a schedule that people are relying on.
 */
export function parseFlightPage(html: string): {
  matches: SyncedMatch[];
  teams: SyncedTeam[];
} {
  const root = parse(html);
  const rows = root.querySelectorAll("tr");
  if (rows.length === 0) {
    throw new Error("no table rows on the page — the markup has changed");
  }

  const matches: SyncedMatch[] = [];
  const teams = new Map<string, SyncedTeam>();
  let date: string | null = null;
  let inSchedule = false;

  for (const row of rows) {
    // The standings table sits above the schedule and its rows are the same
    // width — team, played, won, drawn, lost, goals, points — so width alone
    // reads them as fixtures. Nine columns of a league table were being
    // returned as nine matches with no date and no kick-off time. Only rows
    // after a schedule header count.
    if (text(row).includes("Home Team")) {
      inSchedule = true;
      continue;
    }

    // Date headings sit between the rows they introduce.
    const heading = parseHeadingDate(text(row));
    if (heading) {
      date = heading;
      continue;
    }

    if (!inSchedule) continue;

    const cells = row.querySelectorAll("td");
    // Game, Division/Flight, Group, Time, Home, Result, Away, Field, Location
    if (cells.length < 9) continue;

    const number = text(cells[0]).replace(/^#/, "");
    if (!number) continue;

    // A fixture always has a kick-off. Anything in this table without one is
    // a spacer or a summary row, not a game.
    const time = parseTime(text(cells[3]));
    if (!time) continue;

    const division = text(cells[1]);
    const group = text(cells[2]) || null;
    const homeName = text(cells[4]);
    const awayName = text(cells[6]);
    if (!homeName || !awayName) continue;

    const score = parseScore(text(cells[5]));
    const homeTeamId = teamIdFrom(cells[4]);
    const awayTeamId = teamIdFrom(cells[6]);

    for (const [id, name] of [
      [homeTeamId, homeName],
      [awayTeamId, awayName],
    ] as const) {
      if (id && !teams.has(id)) teams.set(id, { sourceTeamId: id, name, division, group });
    }

    matches.push({
      sourceMatchId: number,
      division,
      group,
      date,
      time,
      homeTeamId,
      awayTeamId,
      homeName,
      awayName,
      homeScore: score?.[0] ?? null,
      awayScore: score?.[1] ?? null,
      field: text(cells[7]) || null,
      venue: text(cells[8]) || null,
    });
  }

  // A page with rows but no schedule header at all is not an empty flight, it
  // is a page we no longer understand.
  if (matches.length === 0 && !inSchedule) {
    throw new Error("found rows but no schedule among them — the markup has changed");
  }

  return { matches, teams: [...teams.values()] };
}

/** The flight pages linked from an event's groups page. */
export function parseFlightLinks(html: string): string[] {
  const root = parse(html);
  const hrefs = root
    .querySelectorAll("a")
    .map((a) => a.getAttribute("href") ?? "")
    .filter((h) => h.includes("/schedules?flight-id="));
  return [...new Set(hrefs)];
}

export const athletes2events: ExternalEventProvider = {
  platform: "athletes2events",

  matches(url) {
    try {
      return new URL(url).hostname.endsWith(HOST);
    } catch {
      return false;
    }
  },

  parseUrl(url) {
    try {
      const u = new URL(url);
      const m = u.pathname.match(/\/events\/(\d+)/);
      if (!m) return null;
      return {
        platform: "athletes2events",
        eventId: m[1],
        subdomain: u.hostname.replace(`.${HOST}`, ""),
      };
    } catch {
      return null;
    }
  },

  async fetch(ref: SourceRef): Promise<SyncResult> {
    /*
     * Every club has its own subdomain here, and event ids are numbered per
     * club: 130 is one tournament on crossfire and a different one next door.
     * There is no sensible default, and guessing one would quietly show a
     * parent somebody else's fixtures — so a ref without a subdomain is a
     * refusal, not a fallback.
     */
    if (!ref.subdomain) {
      return {
        ok: false,
        error: {
          kind: "unrecognised",
          detail: "no club subdomain: connect this event with its schedule URL",
        },
      };
    }

    const base = `https://${ref.subdomain}.${HOST}/events/${ref.eventId}`;

    let groups: string;
    try {
      groups = await get(`${base}/groups`);
    } catch (e) {
      return { ok: false, error: { kind: "unreachable", detail: String(e) } };
    }

    const flights = parseFlightLinks(groups);
    if (flights.length === 0) {
      // A tournament always has at least one flight. None means the page is
      // not the page we think it is.
      return {
        ok: false,
        error: { kind: "unrecognised", detail: "no flight links on the groups page" },
      };
    }

    const matches: SyncedMatch[] = [];
    const teams = new Map<string, SyncedTeam>();

    for (const href of flights) {
      let page: string;
      try {
        page = await get(href);
      } catch (e) {
        // One flight failing is the whole sync failing. A partial schedule
        // shown as complete is worse than no schedule: a parent whose game is
        // in the missing flight concludes there is no game.
        return { ok: false, error: { kind: "unreachable", detail: `${href}: ${e}` } };
      }

      let parsed;
      try {
        parsed = parseFlightPage(page);
      } catch (e) {
        return {
          ok: false,
          error: { kind: "unrecognised", detail: `${href}: ${e}` },
        };
      }

      matches.push(...parsed.matches);
      for (const t of parsed.teams) if (!teams.has(t.sourceTeamId)) teams.set(t.sourceTeamId, t);
    }

    return { ok: true, data: { source: ref, teams: [...teams.values()], matches } };
  },
};
