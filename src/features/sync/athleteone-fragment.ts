/**
 * Reading an AthleteOne schedule fragment out of a HAR export.
 *
 * The widget on a league's own site fetches these from
 * api.athleteone.com/api/Script/get-conference-schedules/… and drops them
 * straight into the page. We cannot fetch one — a plain request is answered
 * 403, "you do not have permission to perform this operation" — but a person
 * reading the page already did, and a HAR is that exchange as a file.
 *
 * So this parses exactly the markup copier.ts reads, one step earlier: the
 * copier reads it after the browser has rendered it, this reads it before.
 * The rules are a1Fixture's, deliberately, and **the two have to move
 * together** — a change to how AthleteOne stacks a row breaks both.
 *
 * One thing does not carry over. The copier splits a stacked cell with
 * `innerText.split("\n")`, which works because a browser puts a line break
 * between block elements. Nothing does that here, so the split is the cell's
 * own block children — the same seam, read from the markup rather than from
 * the rendering of it.
 */
import { parse, type HTMLElement } from "node-html-parser";

import { CANONICAL_HEADER } from "./paste";

/** The stacked pieces of one cell: a browser's line breaks, from the markup. */
function parts(cell: HTMLElement): string[] {
  const blocks = cell.querySelectorAll(":scope > div, :scope > p, :scope > li");
  const source = blocks.length > 0 ? blocks : [cell];
  return source
    .map((el) => el.text.replace(/\s+/g, " ").trim())
    .filter((s) => s !== "");
}

const clean = (v: string) => v.toLowerCase().replace(/\s+/g, " ").trim();

/** The first column whose heading contains all of these words. */
function colWith(head: string[], words: string[]): number {
  return head.findIndex((h) => words.every((w) => h.includes(w)));
}

export type FragmentRow = {
  date: string;
  time: string;
  division: string;
  home: string;
  away: string;
  homeScore: string;
  awayScore: string;
  field: string;
  venue: string;
};

/**
 * The fixtures in one fragment, or none where it is not one of these.
 *
 * Recognised by what the header says rather than by the address it came from
 * — the same table arrives with a leading "GM#" column through the widget and
 * without one through AthleteOne's own site, and it says both "Team & Venue"
 * and "Teams & Venues". Fixed positions got one of those and quietly put the
 * game number where the date goes.
 */
export function readAthleteOneFragment(html: string): FragmentRow[] {
  const table = parse(html).querySelector("table");
  if (!table) return [];

  const rows = table.querySelectorAll("tr");
  if (rows.length < 2) return [];

  const head = rows[0].querySelectorAll("th, td").map((c) => clean(c.text));
  const infoCol = colWith(head, ["game", "info"]);
  const whoCol = colWith(head, ["team", "venue"]);
  if (infoCol < 0 || whoCol < 0) return [];

  const out: FragmentRow[] = [];
  for (const tr of rows.slice(1)) {
    const cells = tr.querySelectorAll("td");
    if (cells.length <= whoCol) continue;

    const meta = parts(cells[infoCol]);
    // Fewer than a date and a time is the header repeated, or a spacer.
    if (meta.length < 2) continue;
    const who = parts(cells[whoCol]);
    if (who.length < 2) continue;

    /*
     * "Chesterly Park - Field 5" is one string for two things, and the last
     * " - " is the seam: a venue may carry a hyphen of its own, and a field
     * is what comes after the final one.
     */
    let venue = who[2] ?? "";
    let field = "";
    const cut = venue.lastIndexOf(" - ");
    if (cut > 0) {
      field = venue.slice(cut + 3);
      venue = venue.slice(0, cut);
    }

    /*
     * The score lives in the last cell, as bare numbers, and only once a game
     * has been played — until then that cell is "Game Preview" and there are
     * none. Both are taken or neither: one number is a cell we have misread.
     */
    const nums = parts(cells[cells.length - 1]).filter((v) => /^\d+$/.test(v));
    const scored = nums.length > 1;

    out.push({
      date: meta[0] ?? "",
      time: meta[1] ?? "",
      division: meta[2] ?? "",
      home: who[0] ?? "",
      away: who[1] ?? "",
      homeScore: scored ? nums[0] : "",
      awayScore: scored ? nums[1] : "",
      field,
      venue,
    });
  }
  return out;
}

/**
 * The fragments as the paste box already takes them.
 *
 * Ending at the canonical TSV rather than at fixtures of its own: everything
 * downstream — the date guard, the team binder, the idempotent apply — is
 * already written against it, and a second way in would be a second set of
 * those to keep true.
 */
export function fragmentsToTsv(htmls: string[]): string {
  const rows = htmls.flatMap(readAthleteOneFragment);
  const line = (r: FragmentRow) =>
    [
      r.date,
      r.time,
      "",
      r.division,
      r.home,
      r.homeScore,
      r.awayScore,
      r.away,
      r.field,
      r.venue,
    ].join("\t");
  return [CANONICAL_HEADER.join("\t"), ...rows.map(line)].join("\n");
}
