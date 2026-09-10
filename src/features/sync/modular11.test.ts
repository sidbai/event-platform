import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  divisionOf,
  matchesOf,
  mergePages,
  pageUrl,
  parseModular11Url,
  readModular11Page,
  teamsOf,
  type Modular11Row,
} from "./modular11";

/** Three rows and the heading, lifted out of a real PACNW response. */
const page = readFileSync(
  join(__dirname, "__fixtures__/modular11-get-matches.html"),
  "utf8",
);

describe("readModular11Page", () => {
  it("reads a fixture out of their responsive grid", () => {
    const [first] = readModular11Page(page);
    expect(first).toEqual({
      matchId: "131434",
      gender: "MALE",
      age: "U13",
      division: "EA PACNW",
      date: "2026-09-12",
      time: "09:00",
      home: "Everett FC",
      away: "ALBION SC Washington",
      homeScore: null,
      awayScore: null,
      venue: "Lincoln Field",
      field: "Lincoln Field",
    });
  });

  it("takes the pitch before the ground, which is their order and not the other one", () => {
    /*
     * "Field 1 - Silas High School". AthleteOne writes it the other way round,
     * and the first row here — "Lincoln Field - Lincoln Field" — would have
     * read correctly either way, which is exactly why it is not the test.
     */
    const rows = readModular11Page(page);
    const silas = rows.find((r) => r.venue === "Silas High School");
    expect(silas?.field).toBe("Field 1");
  });

  it("reads the hidden column, because the visible one is truncated", () => {
    // The desktop cell shows "Lincoln Field -…"; the mobile copy is whole.
    for (const row of readModular11Page(page)) {
      expect(row.venue).not.toMatch(/\.\.\.|…/);
    }
  });

  it("turns their 12-hour clock into a 24-hour one", () => {
    expect(readModular11Page(page)[0].time).toBe("09:00");
    const afternoon = page.replaceAll("09:00am", "01:30pm");
    expect(readModular11Page(afternoon)[0].time).toBe("13:30");
    const noon = page.replaceAll("09:00am", "12:15pm");
    expect(readModular11Page(noon)[0].time).toBe("12:15");
    const midnight = page.replaceAll("09:00am", "12:15am");
    expect(readModular11Page(midnight)[0].time).toBe("00:15");
  });

  it("leaves a score alone until there is one", () => {
    for (const row of readModular11Page(page)) {
      expect(row.homeScore).toBeNull();
      expect(row.awayScore).toBeNull();
    }
    const played = page.replaceAll("TBD", "3 - 1");
    const [first] = readModular11Page(played);
    expect([first.homeScore, first.awayScore]).toEqual([3, 1]);
  });

  it("says nothing about markup that is not one of these", () => {
    expect(readModular11Page("")).toEqual([]);
    expect(readModular11Page("<div>nothing here</div>")).toEqual([]);
  });
});

describe("divisions and teams", () => {
  it("names a division by age and conference together", () => {
    expect(divisionOf(readModular11Page(page)[0])).toBe("U13 EA PACNW");
  });

  it("keys a team by its division, because the name repeats across them", () => {
    /*
     * A club fields one side per age group under the same name, and there are
     * no team ids anywhere in their markup — so "Everett FC" is two teams or
     * eight, told apart only by the division they play in.
     */
    const rows = readModular11Page(page);
    const teams = teamsOf(rows);
    expect(teams[0].sourceTeamId).toBe("U13 EA PACNW::Everett FC");
    const matches = matchesOf(rows);
    expect(matches[0].homeTeamId).toBe("U13 EA PACNW::Everett FC");
  });
});

describe("the gender they state in a column", () => {
  it("carries it on the team, because nothing else in their data says it", () => {
    /*
     * Their team names are a club and nothing else, and their division label
     * is "U13 EA PACNW". So the age survives the trip and the gender does
     * not — and a team with no gender has no canonical name to build, which
     * is how seven ages of one club all arrived called "Harbor SC".
     */
    const teams = teamsOf(readModular11Page(page));
    expect(teams.every((t) => t.gender === "boys")).toBe(true);
  });

  it("reads their word for it rather than ours", () => {
    const girls = page.replaceAll("MALE", "FEMALE");
    expect(teamsOf(readModular11Page(girls))[0].gender).toBe("girls");
  });

  it("says nothing where they say nothing", () => {
    const silent = page.replaceAll("MALE", "");
    expect(teamsOf(readModular11Page(silent))[0].gender).toBeNull();
  });
});

describe("mergePages", () => {
  const row = (id: string): Modular11Row => ({
    matchId: id,
    gender: "MALE",
    age: "U13",
    division: "EA PACNW",
    date: "2026-09-12",
    time: "09:00",
    home: "A",
    away: "B",
    homeScore: null,
    awayScore: null,
    venue: null,
    field: null,
  });

  it("drops the repeats their paging hands back", () => {
    // Page 0 and page 1 are the same page, and past the end the last one
    // comes back again rather than nothing.
    const merged = mergePages([[row("1"), row("2")], [row("2"), row("3")]]);
    expect(merged.map((r) => r.matchId)).toEqual(["1", "2", "3"]);
  });
});

describe("pageUrl", () => {
  it("uses the plural parameter, which is the one that filters", () => {
    /*
     * "group" is accepted, ignored, and returns the whole country — which
     * looks like a working filter right up until somebody counts the rows.
     */
    const url = pageUrl({ tournament: 27, bracket: 47, group: 216, page: 3, from: "2026-09-07", to: "2027-06-30" });
    const q = new URL(url).searchParams;
    expect(q.get("groups")).toBe("216");
    expect(q.get("group")).toBeNull();
    expect(q.get("brackets")).toBe("47");
    expect(q.get("open_page")).toBe("3");
    expect(q.get("start_date")).toBe("2026-09-07 00:00:00");
  });
});

describe("parseModular11Url", () => {
  it("reads the bracket out of a page address", () => {
    expect(parseModular11Url("https://www.modular11.com/league-schedule/elite-academy-league/47")).toEqual(
      { platform: "modular11", eventId: "27-47-216" },
    );
  });

  it("lets the address say which league and conference, where it does", () => {
    expect(
      parseModular11Url("https://www.modular11.com/league-schedule/x/48?tournament=27&group=406"),
    ).toEqual({ platform: "modular11", eventId: "27-48-406" });
  });

  it("does not answer for somebody else's address", () => {
    expect(parseModular11Url("https://theecnl.com/sports/x.aspx")).toBeNull();
    expect(parseModular11Url("https://www.modular11.com/about")).toBeNull();
    expect(parseModular11Url("not a url")).toBeNull();
  });
});
