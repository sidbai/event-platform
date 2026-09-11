import { parse, type HTMLElement } from "node-html-parser";

import type { FragmentRow } from "./athleteone-fragment";

/**
 * Reading a GotSport schedule page that a person's browser fetched.
 *
 * GotSport hosts the Washington Premier League and the Girls Academy, and
 * refuses to be read by anything but a browser: robots.txt is a bare
 * `Disallow: /`, and a request without their cookie is sent to a captcha.
 * So nothing here fetches. The weekly bookmark, run by a person on a
 * system.gotsport.com page, saves the pages their browser was shown, and this
 * reads them afterwards — the same seam as AthleteOne's fragments.
 *
 * Two pages matter. The event's front page lists every group with a link to
 * its schedule (`schedules?group=<id>`), and each group's "View All Matches"
 * page (`schedules?date=All&group=<id>`) holds the whole season, one table
 * per match day, with a standings table at the bottom that must not be read
 * as fixtures. A fixture table announces itself by its header:
 *
 *   Match # | Time | Home Team | Results | Away Team | Location | Division
 *
 * Read by that header rather than by position, for the same reason as the
 * AthleteOne reader: the day these columns move, the wrong one is worse than
 * none.
 */

const clean = (v: string) => v.replace(/\s+/g, " ").trim();

/** The first column whose heading contains all of these words. */
function colWith(head: string[], words: string[]): number {
  return head.findIndex((h) => words.every((w) => h.includes(w)));
}

/** A fixture table, by what its header says; standings say "GP" and "Pts". */
function isFixtureTable(table: HTMLElement): boolean {
  const first = table.querySelector("tr");
  if (!first) return false;
  const head = first.querySelectorAll("th, td").map((c) => clean(c.text).toLowerCase());
  return colWith(head, ["home"]) >= 0 && colWith(head, ["away"]) >= 0 && colWith(head, ["time"]) >= 0;
}

/** Whether this markup is a GotSport schedule page at all. */
export function looksLikeGotSport(html: string): boolean {
  return parse(html).querySelectorAll("table").some(isFixtureTable);
}

/**
 * The time cell stacks three things: "Sep 12, 2026", a div with
 * "10:45 AM PDT", and a label — Scheduled, Rescheduled, and whatever else
 * they say once games are played. The zone is dropped: the paste parser reads
 * a clock time, and the event's own timezone says what it means.
 */
function whenOf(cell: HTMLElement): { date: string; time: string; label: string } {
  const label = clean(cell.querySelector("label")?.text ?? "");
  const time = clean(cell.querySelector("div")?.text ?? "").replace(/\s+[A-Z]{2,5}$/, "");
  const date = clean(
    cell.childNodes
      .filter((n) => n.nodeType === 3)
      .map((n) => n.text)
      .join(" "),
  );
  return { date, time, label };
}

/**
 * The fixtures on one GotSport page, or none where it is not one.
 *
 * "Central Park - Central Park 2" is one string for two things, and GotSport
 * puts the seam after the venue — the first " - " — where AthleteOne put it
 * before the field. A field can carry a hyphen of its own ("Field #1- Mod
 * Field"), which is why the first one and not the last.
 */
export function readGotSportFragment(html: string): FragmentRow[] {
  const out: FragmentRow[] = [];
  for (const table of parse(html).querySelectorAll("table")) {
    if (!isFixtureTable(table)) continue;
    const rows = table.querySelectorAll("tr");
    const head = rows[0].querySelectorAll("th, td").map((c) => clean(c.text).toLowerCase());
    const timeCol = colWith(head, ["time"]);
    const homeCol = colWith(head, ["home"]);
    const awayCol = colWith(head, ["away"]);
    const scoreCol = colWith(head, ["result"]);
    const whereCol = colWith(head, ["location"]);
    const divCol = colWith(head, ["division"]);

    for (const tr of rows.slice(1)) {
      const cells = tr.querySelectorAll("td");
      if (cells.length <= Math.max(homeCol, awayCol, timeCol)) continue;
      const when = whenOf(cells[timeCol]);
      const home = clean(cells[homeCol].text);
      const away = clean(cells[awayCol].text);
      if (!when.date || !home || !away) continue;

      const score = scoreCol >= 0 ? clean(cells[scoreCol].text) : "";
      const played = score.match(/^(\d{1,2})\s*[-–:]\s*(\d{1,2})$/);

      let venue = whereCol >= 0 ? clean(cells[whereCol].text) : "";
      let field = "";
      const cut = venue.indexOf(" - ");
      if (cut > 0) {
        field = venue.slice(cut + 3);
        venue = venue.slice(0, cut);
      }

      out.push({
        date: when.date,
        time: when.time,
        division: divCol >= 0 ? clean(cells[divCol].text) : "",
        home,
        away,
        homeScore: played ? played[1] : "",
        awayScore: played ? played[2] : "",
        field,
        venue,
      });
    }
  }
  return out;
}

export type GotSportGroup = { id: string; name: string };

/**
 * Every group on an event's front page, with the id its schedule is under.
 *
 * The bookmark does this in the browser with the same rule — a "Schedule"
 * button whose href names a group, and the bold name in the same row — so
 * this is the version a test can hold against the saved page.
 */
export function readGotSportGroups(html: string): GotSportGroup[] {
  const seen = new Map<string, string>();
  for (const a of parse(html).querySelectorAll('a[href*="schedules?group="]')) {
    const id = a.getAttribute("href")?.match(/group=(\d+)/)?.[1];
    const name = clean(a.closest(".row")?.querySelector("b")?.text ?? "");
    if (id && name && !seen.has(id)) seen.set(id, name);
  }
  return [...seen].map(([id, name]) => ({ id, name }));
}
