import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { readAthleteOneFragment } from "./athleteone-fragment";
import { fragmentsToTsv, readFragment } from "./fragments";
import { looksLikeGotSport, readGotSportFragment, readGotSportGroups } from "./gotsport-fragment";
import { parsePastedSchedule } from "./paste";

const fixture = (name: string) =>
  readFileSync(join(process.cwd(), "tests/fixtures/gotsport", name), "utf8");

// The three pages the owner saved from their own browser on 2026-09-11: the
// WPL 2026 Fall U11–U14 event's front page, the boys U11 day view, and one
// group's whole season ("View All Matches").
const front = fixture("event-55357.html");
const day = fixture("schedule-55357-bu11.html");
const season = fixture("schedule-all-group.html");

describe("readGotSportGroups", () => {
  it("lists every group on the event's front page with its schedule id", () => {
    const groups = readGotSportGroups(front);
    expect(groups).toHaveLength(56);
    expect(groups[0]).toEqual({ id: "522259", name: "BU11 Premier 1" });
    expect(groups.find((g) => g.id === "508465")?.name).toBe("BU11 Classic West");
    expect(groups.at(-1)).toEqual({ id: "508501", name: "GU14 Copa 1 East" });
  });

  it("finds none on a page that is not a front page", () => {
    expect(readGotSportGroups(season)).toHaveLength(0);
  });
});

describe("readGotSportFragment", () => {
  it("reads a fixture row by its header, dropping the zone from the time", () => {
    const rows = readGotSportFragment(day);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0]).toEqual({
      date: "Sep 12, 2026",
      time: "10:45 AM",
      division: "BU11 Premier 1",
      home: "RMG Soccer Academy Panthers B15",
      away: "Legends FC Washington WA B15/16 Gold",
      homeScore: "",
      awayScore: "",
      field: "Central Park 2",
      venue: "Central Park",
    });
  });

  it("splits venue from field at the first seam, so a hyphenated field survives", () => {
    const rows = readGotSportFragment(season);
    const bender = rows.find((r) => r.venue === "Bender Fields");
    expect(bender?.field).toMatch(/^Field #\d- Mod Field$/);
  });

  it("reads a whole season and leaves the standings table alone", () => {
    const rows = readGotSportFragment(season);
    // Eighteen match days of one group; the standings rows have no time cell
    // and no fixture header, and none of them may leak in as a game.
    expect(rows.length).toBeGreaterThan(30);
    expect(rows.every((r) => r.division === "BU11 Classic West")).toBe(true);
    expect(rows.every((r) => /^[A-Z][a-z]{2} \d{2}, 2026$/.test(r.date))).toBe(true);
    expect(rows.every((r) => r.home !== "" && r.away !== "")).toBe(true);
  });

  it("carries a score once one is printed, and nothing until then", () => {
    const played = `<table><tr><th>Match #</th><th>Time</th><th>Home Team</th><th>Results</th><th>Away Team</th><th>Location</th><th>Division</th></tr>
      <tr><td>1</td><td>Sep 12, 2026<div>9:00 AM PDT</div><label>Complete</label></td><td><a>A</a></td><td><a>3 - 1</a></td><td><a>B</a></td><td><ul><li>Park - Field 2</li></ul></td><td>BU11 Copa</td></tr>
      <tr><td>2</td><td>Sep 13, 2026<div>9:00 AM PDT</div><label>Scheduled</label></td><td><a>C</a></td><td><a>-</a></td><td><a>D</a></td><td></td><td>BU11 Copa</td></tr></table>`;
    const [a, b] = readGotSportFragment(played);
    expect([a.homeScore, a.awayScore]).toEqual(["3", "1"]);
    expect([b.homeScore, b.awayScore, b.venue, b.field]).toEqual(["", "", "", ""]);
  });

  it("is not fooled by an AthleteOne fragment, and vice versa", () => {
    expect(looksLikeGotSport(season)).toBe(true);
    expect(looksLikeGotSport(front)).toBe(false);
    expect(readAthleteOneFragment(season)).toHaveLength(0);
  });
});

describe("fragmentsToTsv, through the paste parser", () => {
  it("lands GotSport rows as dated, timed fixtures with their division", () => {
    const tsv = fragmentsToTsv([day]);
    const parsed = parsePastedSchedule(tsv, { division: "", year: 2026 });
    expect(parsed.matches.length).toBe(readFragment(day).length);
    const first = parsed.matches[0];
    expect(first.date).toBe("2026-09-12");
    expect(first.time).toBe("10:45");
    expect(first.division).toBe("BU11 Premier 1");
    expect(first.venue).toBe("Central Park");
    expect(first.field).toBe("Central Park 2");
  });
});
