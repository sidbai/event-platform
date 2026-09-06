/**
 * The parser, against saved copies of real Athletes2Events pages.
 *
 * Fixtures rather than the live site, because a test that fetches is a test
 * that fails when their server is slow and passes when their markup breaks —
 * exactly backwards. These are the 2026 ZF Labor Day Challenge as published.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  athletes2events,
  parseFlightLinks,
  parseFlightPage,
  parseHeadingDate,
  parseScore,
  parseTime,
} from "./athletes2events";

const fixture = (name: string) =>
  readFileSync(join(process.cwd(), "tests/fixtures/athletes2events", name), "utf8");

describe("recognising a URL somebody pasted", () => {
  it("takes an event page and finds the id", () => {
    for (const url of [
      "https://crossfire.athletes2events.com/events/130/groups",
      "https://crossfire.athletes2events.com/events/130/schedules?flight-id=2029",
    ]) {
      expect(athletes2events.parseUrl(url)).toEqual({
        platform: "athletes2events",
        eventId: "130",
        subdomain: "crossfire",
      });
    }
  });

  it("keeps the club subdomain, because event ids only count within one", () => {
    // Every club gets its own host, so event 130 at one club is a different
    // tournament from event 130 at another. Dropping the subdomain would
    // point a sync at somebody else's schedule.
    const a = athletes2events.parseUrl("https://crossfire.athletes2events.com/events/130");
    const b = athletes2events.parseUrl("https://someotherclub.athletes2events.com/events/130");
    expect(a?.subdomain).toBe("crossfire");
    expect(b?.subdomain).toBe("someotherclub");
    expect(a).not.toEqual(b);
  });

  it("claims any club's subdomain, since every club gets its own", () => {
    expect(athletes2events.matches("https://crossfire.athletes2events.com/events/130")).toBe(
      true,
    );
    expect(athletes2events.matches("https://someotherclub.athletes2events.com/events/9")).toBe(
      true,
    );
  });

  it("does not claim another platform, or nonsense", () => {
    expect(athletes2events.matches("https://app.eventconnect.io/events/42108")).toBe(false);
    expect(athletes2events.matches("not a url")).toBe(false);
    expect(athletes2events.parseUrl("https://crossfire.athletes2events.com/")).toBeNull();
  });
});

describe("the small parses", () => {
  it("reads a score, and only a score", () => {
    expect(parseScore("7 - 0")).toEqual([7, 0]);
    expect(parseScore("0-0")).toEqual([0, 0]);
    // Everything a not-yet-played or abandoned game shows instead.
    for (const raw of ["vs", "", "-", "TBD", "Forfeit", "3 - "]) {
      expect(parseScore(raw)).toBeNull();
    }
  });

  it("reads a date heading as a plain date", () => {
    // Plain, not an instant: the page publishes a wall clock in the
    // tournament's own city, and only the caller knows that timezone.
    expect(parseHeadingDate("Sat Sep 05, 2026")).toBe("2026-09-05");
    expect(parseHeadingDate("Mon Dec 21, 2026")).toBe("2026-12-21");
    expect(parseHeadingDate("Boys-U19 - Gold - Matches")).toBeNull();
  });

  it("reads a 12-hour time as 24-hour", () => {
    expect(parseTime("09:05 AM")).toBe("09:05");
    expect(parseTime("04:35 PM")).toBe("16:35");
    expect(parseTime("12:00 PM")).toBe("12:00");
    expect(parseTime("12:30 AM")).toBe("00:30");
    expect(parseTime("kickoff")).toBeNull();
  });
});

describe("a real flight page", () => {
  const { matches, teams } = parseFlightPage(fixture("flight-2029.html"));

  it("finds the fixtures", () => {
    expect(matches.length).toBeGreaterThan(0);
  });

  it("reads a match the way the page shows it", () => {
    const game = matches.find((m) => m.sourceMatchId === "377");
    expect(game).toBeDefined();
    expect(game).toMatchObject({
      division: "Boys-U19 - Gold",
      group: "A",
      date: "2026-09-05",
      time: "09:05",
      homeName: "XF BU17 ECNL 2 - Heimbigner",
      awayName: "Crossfire Select BU19 A Rasam",
      homeScore: 7,
      awayScore: 0,
    });
    expect(game?.field).toContain("60A");
    expect(game?.venue).toContain("60 Acres");
  });

  it("carries the platform's team ids, which outlast its team names", () => {
    const game = matches.find((m) => m.sourceMatchId === "377");
    expect(game?.homeTeamId).toMatch(/^\d+$/);
    expect(game?.awayTeamId).toMatch(/^\d+$/);
  });

  it("collects each team once, however many games it plays", () => {
    const ids = teams.map((t) => t.sourceTeamId);
    expect(new Set(ids).size).toBe(ids.length);
    expect(teams.every((t) => t.name.length > 0)).toBe(true);
  });

  it("gives every match a date, from the heading it sits under", () => {
    // Rows do not carry their own date; it comes from the last heading seen.
    // Getting this wrong would silently file a Sunday game on Saturday.
    for (const m of matches) expect(m.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("leaves an unplayed game without a score rather than a zero", () => {
    // 0-0 is a real result. Null is "not played". Collapsing them would
    // invent draws.
    for (const m of matches) {
      expect(m.homeScore === null).toBe(m.awayScore === null);
    }
  });

  it("reads a second flight the same way", () => {
    const other = parseFlightPage(fixture("flight-2027.html"));
    expect(other.matches.length).toBeGreaterThan(0);
    expect(other.matches[0].division).not.toBe("");
  });
});

describe("failing loudly", () => {
  it("refuses a page it does not recognise", () => {
    // The failure this must never have is a quiet one: a schedule that has
    // not been published and a parser that no longer understands the page
    // both look like zero matches, and treating them alike is how a stale
    // schedule stays up for weeks.
    expect(() => parseFlightPage("<html><body><p>Maintenance</p></body></html>")).toThrow(
      /markup has changed/,
    );
  });

  it("refuses a table that is no longer a schedule", () => {
    expect(() =>
      parseFlightPage("<table><tr><td>a</td><td>b</td></tr></table>"),
    ).toThrow(/markup has changed/);
  });
});

describe("finding the flights of an event", () => {
  it("lists each flight page once", () => {
    const links = parseFlightLinks(fixture("groups.html"));
    expect(links.length).toBeGreaterThan(5);
    expect(new Set(links).size).toBe(links.length);
    for (const l of links) expect(l).toContain("flight-id=");
  });
});
