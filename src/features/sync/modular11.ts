/**
 * Reading a league published on Modular11 — the Elite Academy League.
 *
 * The only one of the three leagues added this week that a server can read at
 * all. GotSport sends an unauthenticated request to a captcha, and Sports
 * Affinity sits behind Imperva; this one answers a plain request with the
 * whole thing, from an endpoint whose own path says `public_schedule`.
 *
 * The parsing is pure and separate from the fetching, so it can be tested
 * against a saved copy of a real response rather than against the live site.
 * The input is somebody else's markup, it will change without warning, and
 * the failure this must never have is a quiet one.
 */
import { parse, type HTMLElement } from "node-html-parser";

import type { Gender } from "@/features/teams/age";
import type {
  ExternalEventProvider,
  SourceRef,
  SyncResult,
  SyncedMatch,
  SyncedTeam,
} from "./provider";

const HOST = "www.modular11.com";

/**
 * A page of results, and the reason paging is not optional.
 *
 * Twenty-five rows arrive whatever is asked for, and twenty-five rows of a
 * hundred look exactly like a hundred: the response carries no total, no
 * "page 2 of 5", nothing that says it is partial. This is the failure the
 * import skill calls the worst available, and the only defence is to keep
 * asking until a page stops bringing anything new.
 */
export const PAGE_SIZE = 25;

/** The Seattle-area conference. Their id, not ours; see the skill. */
export const PACNW_GROUP = 216;

const text = (el: HTMLElement | null | undefined) =>
  (el?.text ?? "").replace(/\s+/g, " ").trim();

/**
 * "09/12/26 09:00am Lincoln Field - Lincoln Field" — one string for three
 * things, from the mobile column.
 *
 * The desktop one truncates the venue with an ellipsis ("Lincoln Field -…"),
 * and the row carries both because the layout is responsive. The hidden copy
 * is the complete one, which is a good reason to read the markup rather than
 * what a browser would have shown.
 */
function whenAndWhere(raw: string): {
  date: string | null;
  time: string | null;
  venue: string | null;
  field: string | null;
} {
  const m = raw.match(/^(\d{2})\/(\d{2})\/(\d{2})\s+(\d{1,2}):(\d{2})\s*([ap])m\s*(.*)$/i);
  if (!m) return { date: null, time: null, venue: raw || null, field: null };

  const [, mm, dd, yy, hh, min, ampm, rest] = m;
  let hour = Number(hh) % 12;
  if (ampm.toLowerCase() === "p") hour += 12;

  /*
   * "Field 1 - Silas High School": the pitch first and the ground second,
   * which is the opposite way round from AthleteOne and the reason this is
   * not shared with the reader next door. Read from the real thing —
   * "Lincoln Field - Lincoln Field" would have looked right either way.
   *
   * Split on the first separator, since a school's name is far more likely
   * to carry a hyphen than "Field 1" is.
   */
  let field: string | null = rest.trim() || null;
  let venue: string | null = null;
  const cut = rest.indexOf(" - ");
  if (cut > 0) {
    field = rest.slice(0, cut).trim() || null;
    venue = rest.slice(cut + 3).trim() || null;
  }

  return {
    date: `20${yy}-${mm}-${dd}`,
    time: `${String(hour).padStart(2, "0")}:${min}`,
    venue,
    field,
  };
}

/** "3 - 1", once a game has been played; "TBD" until then. */
function score(raw: string): [number, number] | null {
  const m = raw.match(/^(\d+)\s*[-–]\s*(\d+)$/);
  if (!m) return null;
  return [Number(m[1]), Number(m[2])];
}

export type Modular11Row = {
  matchId: string;
  gender: string | null;
  age: string;
  division: string;
  date: string | null;
  time: string | null;
  home: string;
  away: string;
  homeScore: number | null;
  awayScore: number | null;
  venue: string | null;
  field: string | null;
};

/**
 * The fixtures in one page of their markup.
 *
 * Read by class rather than by position: the row is a responsive grid, the
 * same value appears twice in it, and the column that carries the complete
 * version is the one a browser would have hidden.
 */
export function readModular11Page(html: string): Modular11Row[] {
  const root = parse(html);
  const out: Modular11Row[] = [];

  for (const row of root.querySelectorAll(".container-row")) {
    const teams = row.querySelector(".container-teams-info");
    const home = text(teams?.querySelector(".container-first-team"));
    const away = text(teams?.querySelector(".container-second-team"));
    if (!home || !away) continue;

    /*
     * The desktop columns, in order: id and gender, when and where, age,
     * competition. Taken by index within that row rather than by a class of
     * their own, because they have none — but the row they sit in does, and
     * the teams block above is read by name, which is the part that matters.
     */
    const cols = row.querySelectorAll(".table-content-row > div");
    const idCell = text(cols[0]).split(/\s+/);
    const matchId = idCell[0] ?? "";
    if (!/^\d+$/.test(matchId)) continue;

    const mobile = text(row.querySelector(".col-xs-2.pad-right"));
    const desktop = text(cols[1]);
    const when = whenAndWhere(mobile || desktop);

    const pair = score(text(row.querySelector(".container-score")));

    out.push({
      matchId,
      gender: idCell[1] ?? null,
      age: text(cols[2]),
      division: text(cols[3]),
      date: when.date,
      time: when.time,
      home,
      away,
      homeScore: pair ? pair[0] : null,
      awayScore: pair ? pair[1] : null,
      venue: when.venue,
      field: when.field,
    });
  }

  return out;
}

/**
 * Their own word for it, as this application spells it.
 *
 * "MALE" and "FEMALE" in a column of their own, which is the only place this
 * platform writes the gender down: their team names carry a club and nothing
 * else, and their division label is "U13 EA PACNW". Without it every age of
 * a club's side is named the same thing.
 */
function genderOf(row: Modular11Row): Gender | null {
  const g = (row.gender ?? "").toUpperCase();
  if (g.startsWith("M") || g.startsWith("B")) return "boys";
  if (g.startsWith("F") || g.startsWith("G")) return "girls";
  return null;
}

/** Their age group and conference together — "U13 EA PACNW". */
export function divisionOf(row: Modular11Row): string {
  return [row.age, row.division].filter(Boolean).join(" ").trim() || "Unassigned";
}

/**
 * Rows from several pages, with the repeats dropped.
 *
 * Their paging returns the same page for 0 and 1, and a request past the end
 * returns the last one again rather than nothing. Keyed on the match id, which
 * is the only thing in a row that is theirs and stable.
 */
export function mergePages(pages: Modular11Row[][]): Modular11Row[] {
  const byId = new Map<string, Modular11Row>();
  for (const page of pages) for (const row of page) byId.set(row.matchId, row);
  return [...byId.values()];
}

/** Everything a page of theirs needs said about it, as a URL. */
export function pageUrl(opts: {
  tournament: number;
  bracket: number;
  group: number;
  page: number;
  from: string;
  to: string;
}): string {
  const q = new URLSearchParams({
    open_page: String(opts.page),
    academy: "0",
    tournament: String(opts.tournament),
    gender: "0",
    age: "",
    brackets: String(opts.bracket),
    // Plural. "group" is accepted, ignored, and returns the whole country —
    // which looks like a working filter until somebody counts.
    groups: String(opts.group),
    match_number: "0",
    status: "scheduled",
    match_type: "2",
    schedule: "0",
    team: "0",
    location: "0",
    as_referee: "0",
    report_status: "0",
    match_status: "0",
    start_date: `${opts.from} 00:00:00`,
    end_date: `${opts.to} 23:59:59`,
  });
  return `https://${HOST}/public_schedule/league/get_matches?${q}`;
}

/** The teams a set of rows names, keyed the way this platform names them. */
export function teamsOf(rows: Modular11Row[]): SyncedTeam[] {
  const seen = new Map<string, SyncedTeam>();
  for (const row of rows) {
    const division = divisionOf(row);
    for (const name of [row.home, row.away]) {
      /*
       * No team ids anywhere in the markup, so the name is the identity — and
       * a name is only unique within its division here, because a club fields
       * one side per age group under the same name.
       */
      const key = `${division}::${name}`;
      if (!seen.has(key)) {
        seen.set(key, { sourceTeamId: key, name, division, group: null, gender: genderOf(row) });
      }
    }
  }
  return [...seen.values()];
}

export function matchesOf(rows: Modular11Row[]): SyncedMatch[] {
  return rows.map((row) => {
    const division = divisionOf(row);
    return {
      sourceMatchId: row.matchId,
      division,
      group: null,
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
    };
  });
}

export const MODULAR11_HOST = HOST;
export type { ExternalEventProvider, SourceRef, SyncResult };

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
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.text();
}

/**
 * Past this many pages something is wrong on our side rather than theirs.
 *
 * A season is thirty-six pages; a hundred is a loop that has stopped noticing
 * it is being handed the same rows.
 */
const MAX_PAGES = 100;

/** The window a season could fall in. Wider than one, narrower than forever. */
function seasonWindow(now = new Date()): { from: string; to: string } {
  const year = now.getUTCFullYear();
  // A season runs late summer to early summer, so anchor on the August before.
  const start = now.getUTCMonth() >= 6 ? year : year - 1;
  return { from: `${start}-07-01`, to: `${start + 1}-06-30` };
}

/**
 * Which league, which bracket and which conference, out of a pasted address.
 *
 * The page's own URL carries only the bracket — the last segment of
 * /league-schedule/elite-academy-league/47. The other two live in the calls
 * its scripts make, so they are accepted as query parameters and otherwise
 * default to the Elite Academy League and the Seattle-area conference, which
 * are the ones this directory follows. Both are written down in the skill
 * along with how to read the next season's off the page.
 */
export function parseModular11Url(url: string): SourceRef | null {
  try {
    const u = new URL(url);
    if (u.hostname !== HOST && u.hostname !== "modular11.com") return null;
    const bracket = u.pathname.match(/\/league-schedule\/[^/]+\/(\d+)/)?.[1];
    if (!bracket) return null;
    const tournament = u.searchParams.get("tournament") ?? "27";
    const group = u.searchParams.get("group") ?? String(PACNW_GROUP);
    return { platform: "modular11", eventId: `${tournament}-${bracket}-${group}` };
  } catch {
    return null;
  }
}

export const modular11: ExternalEventProvider = {
  platform: "modular11",

  matches(url) {
    return parseModular11Url(url) !== null;
  },

  parseUrl(url) {
    return parseModular11Url(url);
  },

  async fetch(ref) {
    const [tournament, bracket, group] = ref.eventId.split("-").map(Number);
    if (!tournament || !bracket || !group) {
      return { ok: false, error: { kind: "unrecognised", detail: `bad event id ${ref.eventId}` } };
    }

    const { from, to } = seasonWindow();
    const pages: Modular11Row[][] = [];
    let previous = "";

    try {
      for (let page = 1; page <= MAX_PAGES; page++) {
        const html = await get(pageUrl({ tournament, bracket, group, page, from, to }));
        const rows = readModular11Page(html);
        /*
         * Two ways a run ends, and both have to be watched for. Their paging
         * returns nothing past the end on some queries and the last page
         * again on others — taking only the first would spin, and taking only
         * the second would stop one page early where a page repeats legally.
         */
        if (rows.length === 0) break;
        const ids = rows.map((r) => r.matchId).join(",");
        if (ids === previous) break;
        previous = ids;
        pages.push(rows);
        if (rows.length < PAGE_SIZE) break;
      }
    } catch (e) {
      return {
        ok: false,
        error: { kind: "unreachable", detail: e instanceof Error ? e.message : String(e) },
      };
    }

    const rows = mergePages(pages);
    if (rows.length === 0) {
      return {
        ok: false,
        error: {
          kind: "unrecognised",
          detail: "no fixtures in any page — their markup or the ids may have changed",
        },
      };
    }

    return { ok: true, data: { source: ref, teams: teamsOf(rows), matches: matchesOf(rows) } };
  },
};
