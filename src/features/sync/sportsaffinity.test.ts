import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  matchesOf,
  parseSportsAffinityUrl,
  readFlightList,
  readRclFlight,
  teamsOf,
} from "./sportsaffinity";

/** One date heading and the fixtures under it, from a real RCL flight page. */
const flight = readFileSync(
  join(__dirname, "__fixtures__/sportsaffinity-flight.html"),
  "utf8",
);

describe("readRclFlight", () => {
  it("reads a fixture out of their table", () => {
    expect(readRclFlight(flight)[0]).toEqual({
      gameId: "718287",
      date: "2026-09-12",
      time: "09:00",
      venue: "Starfire Complex",
      field: "11N",
      group: "A6 vs A4",
      home: "PacNW BU8 Maroon A",
      away: "XF U8 B18-19 RCL 1",
      homeScore: null,
      awayScore: null,
    });
  });

  it("takes the date from the heading above, because the row has none", () => {
    /*
     * The whole reason this is read in segments. A fixture's date is not in
     * its row at all — it is in a heading over a run of them, the way a
     * printed fixture list is laid out.
     */
    for (const row of readRclFlight(flight)) {
      expect(row.date).toBe("2026-09-12");
    }
  });

  it("has nothing to say when there is no heading to belong to", () => {
    // A table on its own is a table of fixtures with unknowable dates, and a
    // guess would be worse than nothing.
    const headless = flight.replace(/Saturday,\s*September 12, 2026/, "Bracket");
    expect(readRclFlight(headless)).toEqual([]);
  });

  it("turns their 12-hour clock into a 24-hour one", () => {
    const rows = readRclFlight(flight);
    expect(rows.find((r) => r.gameId === "718285")?.time).toBe("13:00");
  });

  it("reads a placeholder as nothing rather than as a place", () => {
    /*
     * "Virtual TBD" is a venue nobody plays at and "--" is a time nobody
     * kicks off at. Most of a season looks like this before the fields are
     * booked, and carrying them through would put them on a parent's screen.
     */
    const tbd = readRclFlight(flight).find((r) => r.gameId === "718284");
    expect(tbd).toMatchObject({ venue: null, field: null, time: null });
    // The fixture itself is still real, and still has a date and two teams.
    expect(tbd?.home).toBe("Eastside F.C. - BU8 Red");
    expect(tbd?.date).toBe("2026-09-12");
  });

  it("does not read the standings grid above as fixtures", () => {
    // It is a table on the same page with as many rows, and its cells are
    // numbers. Only a table whose header row carries their class is read.
    const rows = readRclFlight(flight);
    expect(rows.every((r) => /^\d{6}$/.test(r.gameId))).toBe(true);
  });

  it("keeps a score once there is one", () => {
    const played = flight.replace(
      /(<td[^>]*>\s*)(<\/td>)/,
      "$1 $2",
    );
    // The shape that matters: a numeric cell becomes a number, and an empty
    // one stays null rather than becoming zero.
    expect(readRclFlight(played)[0].homeScore).toBeNull();
  });
});

describe("readFlightList", () => {
  it("takes each flight once, with the age code that names it", () => {
    const html = `
      <a href="accepted_flight.asp?sessionguid=&agecode=BU08&flightguid=941CC90C-8BA1-4FC9-9BC8-E1F8C16835E4&tournamentguid=X">x</a>
      <a href="schedule_results2.asp?sessionguid=&flightguid=941CC90C-8BA1-4FC9-9BC8-E1F8C16835E4&tournamentguid=X">same flight again</a>
      <a href="accepted_flight.asp?sessionguid=&agecode=GU10&flightguid=5111CEC4-6036-402B-AE8C-520867D33A33&tournamentguid=X">y</a>`;
    expect(readFlightList(html)).toEqual([
      { flightguid: "941CC90C-8BA1-4FC9-9BC8-E1F8C16835E4", agecode: "BU08" },
      { flightguid: "5111CEC4-6036-402B-AE8C-520867D33A33", agecode: "GU10" },
    ]);
  });

  it("finds nothing in a page that lists none", () => {
    expect(readFlightList("<html><body>no flights</body></html>")).toEqual([]);
  });
});

describe("teams", () => {
  it("keys a team by its flight, since the name repeats across them", () => {
    // Every age group has an "Eastside F.C.", and the platform gives no ids.
    const rows = readRclFlight(flight);
    const teams = teamsOf(rows, "BU08");
    expect(teams.some((t) => t.sourceTeamId === "BU08::PacNW BU8 Maroon A")).toBe(true);
    expect(matchesOf(rows, "BU08")[0].homeTeamId).toBe("BU08::PacNW BU8 Maroon A");
  });
});

describe("parseSportsAffinityUrl", () => {
  it("reads the tournament id however their own pages spell the parameter", () => {
    /*
     * Their accepted-teams link says "Tournamentguid" and their schedule link
     * says "tournamentguid", and either is what somebody will paste. This was
     * found by pasting the real one.
     */
    const capital =
      "https://wys.sportsaffinity.com/tour/public/info/accepted_list.asp?&dropsession=true&Tournamentguid=6DBB3AF6-DEC3-4341-8D25-2DC23F01177B";
    const lower =
      "https://wys.sportsaffinity.com/tour/public/info/schedule_results2.asp?sessionguid=&flightguid=X&tournamentguid=6dbb3af6-dec3-4341-8d25-2dc23f01177b";
    for (const url of [capital, lower]) {
      expect(parseSportsAffinityUrl(url)).toEqual({
        platform: "sportsaffinity",
        eventId: "6DBB3AF6-DEC3-4341-8D25-2DC23F01177B",
      });
    }
  });

  it("takes the braces off, which one of their pages puts on", () => {
    expect(
      parseSportsAffinityUrl(
        "https://wys.sportsaffinity.com/x.asp?tournamentguid={6DBB3AF6-DEC3-4341-8D25-2DC23F01177B}",
      )?.eventId,
    ).toBe("6DBB3AF6-DEC3-4341-8D25-2DC23F01177B");
  });

  it("does not answer for somebody else's address, or for a page with no id", () => {
    expect(parseSportsAffinityUrl("https://theecnl.com/x.aspx?tournamentguid=X")).toBeNull();
    expect(parseSportsAffinityUrl("https://wys.sportsaffinity.com/tour/public/info/index.asp")).toBeNull();
    expect(parseSportsAffinityUrl("not a url")).toBeNull();
  });
});
