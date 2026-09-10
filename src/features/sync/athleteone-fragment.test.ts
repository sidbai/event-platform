import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { fragmentsToTsv, readAthleteOneFragment } from "./athleteone-fragment";
import { parsePastedSchedule } from "./paste";

/**
 * Three rows lifted out of a real export, logos removed to keep it readable.
 *
 * From a HAR of the ECNL Regional League Boys page: the header AthleteOne
 * prints through the widget, a fixture with no time or pitch yet, and one
 * with both. Written against the bytes rather than against a description of
 * them, because the failure that matters here is a quiet one.
 */
const fragment = readFileSync(
  join(__dirname, "__fixtures__/athleteone-conference-schedules.html"),
  "utf8",
);

describe("readAthleteOneFragment", () => {
  it("reads the fixtures out of the markup the widget is handed", () => {
    const rows = readAthleteOneFragment(fragment);
    expect(rows).toHaveLength(2);
    expect(rows[1]).toEqual({
      date: "Sep 12, 2026",
      time: "11:00 AM",
      division: "BU13 - ECNL Regional League",
      home: "Central Washington Sounders ECNL RL B2013/14",
      away: "Columbia Premier SC ECNL RL B2013/14",
      homeScore: "",
      awayScore: "",
      field: "Field 5",
      venue: "Chesterly Park",
    });
  });

  it("splits the pitch off the venue at the last separator", () => {
    // "Chesterly Park - Field 5" is one string for two things, and a venue
    // may carry a hyphen of its own.
    expect(readAthleteOneFragment(fragment)[1].field).toBe("Field 5");
    expect(readAthleteOneFragment(fragment)[1].venue).toBe("Chesterly Park");
  });

  it("carries a season the league has not scheduled yet, as it stands", () => {
    /*
     * A league publishes its whole season and fills the times in later.
     * "12:00 AM" and "-" are what the platform actually says, and passing
     * them through is what lets events/kickoff.ts print "Time TBD" rather
     * than this file deciding on its behalf.
     */
    const first = readAthleteOneFragment(fragment)[0];
    expect(first.time).toBe("12:00 AM");
    expect(first.venue).toBe("-");
    expect(first.field).toBe("");
  });

  it("takes both scores or neither", () => {
    // One number in that cell is a cell we have misread, not a 3-0.
    for (const row of readAthleteOneFragment(fragment)) {
      expect(row.homeScore === "").toBe(row.awayScore === "");
    }
  });

  it("finds its columns by what the heading says, not by position", () => {
    /*
     * The same table arrives with a leading "GM#" through the widget and
     * without one through AthleteOne's own site, and says both "Team &
     * Venue" and "Teams & Venues". Fixed positions got one of those and put
     * the game number where the date goes.
     */
    const noGameNumber = fragment
      .replace(/<th[^>]*>GM#<\/th>/i, "")
      .replace(/<td[^>]*>\s*\d{6,}\s*<\/td>/g, "");
    const rows = readAthleteOneFragment(noGameNumber);
    expect(rows).toHaveLength(2);
    expect(rows[1].home).toBe("Central Washington Sounders ECNL RL B2013/14");

    const plural = fragment.replace(/TEAM &amp; VENUE|TEAM & VENUE/i, "Teams &amp; Venues");
    expect(readAthleteOneFragment(plural)).toHaveLength(2);
  });

  it("says nothing about markup that is not one of these", () => {
    expect(readAthleteOneFragment("")).toEqual([]);
    expect(readAthleteOneFragment("<div>no table here</div>")).toEqual([]);
    expect(readAthleteOneFragment("<table><tr><th>Team</th><th>Pts</th></tr></table>")).toEqual([]);
  });
});

describe("fragmentsToTsv", () => {
  it("ends where the paste box begins, so there is one way in and not two", () => {
    const tsv = fragmentsToTsv([fragment]);
    const out = parsePastedSchedule(tsv, {
      division: "BU13 - ECNL Regional League",
      year: 2026,
    });

    expect(out.skipped).toEqual([]);
    expect(out.matches).toHaveLength(2);
    expect(out.matches[1]).toMatchObject({
      date: "2026-09-12",
      time: "11:00",
      home: "Central Washington Sounders ECNL RL B2013/14",
      away: "Columbia Premier SC ECNL RL B2013/14",
      homeScore: null,
      awayScore: null,
    });
  });

  it("takes a whole export at once, since a season is one flight per call", () => {
    const both = fragmentsToTsv([fragment, fragment]);
    expect(both.split("\n")).toHaveLength(5); // header and four fixtures
  });

  it("is a header and nothing else when there was nothing to read", () => {
    expect(fragmentsToTsv(["<div/>"]).split("\n")).toHaveLength(1);
  });
});
