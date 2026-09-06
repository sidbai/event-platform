import { describe, expect, it } from "vitest";

import {
  bracketOf,
  isPlaceholderName,
  parsePastedDate,
  parsePastedSchedule,
  parsePastedTime,
  toSyncedEvent,
} from "./paste";

const options = { division: "Unassigned", year: 2026 };

describe("parsePastedTime", () => {
  it("reads what a schedule prints", () => {
    expect(parsePastedTime("4:00 PM")).toBe("16:00");
    expect(parsePastedTime("8:20 AM")).toBe("08:20");
    expect(parsePastedTime("12:00 PM")).toBe("12:00");
    expect(parsePastedTime("12:30 AM")).toBe("00:30");
    expect(parsePastedTime("14:30")).toBe("14:30");
  });

  it("says nothing rather than guessing", () => {
    expect(parsePastedTime("Field 11A")).toBeNull();
    expect(parsePastedTime("Seattle United B16")).toBeNull();
  });
});

describe("parsePastedDate", () => {
  it("reads the headings platforms actually print", () => {
    expect(parsePastedDate("Fri, Sep 4, 2026", 2026)).toBe("2026-09-04");
    expect(parsePastedDate("Saturday, September 5, 2026", 2026)).toBe("2026-09-05");
    expect(parsePastedDate("Sep 6", 2026)).toBe("2026-09-06");
    expect(parsePastedDate("9/7/2026", 2026)).toBe("2026-09-07");
  });

  it("refuses a date that does not exist", () => {
    expect(parsePastedDate("Feb 31, 2026", 2026)).toBeNull();
  });
});

describe("bracketOf", () => {
  it("takes the bracket from a slot label", () => {
    expect(bracketOf("A1 vs A4")).toBe("A");
    expect(bracketOf("B4 vs B3")).toBe("B");
  });

  it("gives none to a division too small to have brackets", () => {
    // "5 vs 1" is a round-robin of one group; inventing a bracket letter
    // would split a table that should be whole.
    expect(bracketOf("5 vs 1")).toBeNull();
  });
});

describe("parsePastedSchedule", () => {
  /** A row as this table gives it: time/slot/division, then two score cells. */
  const row = [
    "4:00 PM A1 vs A4 Boys U14 White",
    "IFC B14 Red",
    "1",
    "7",
    "Nido Aguila Seattle B12/13",
    "Field 1 Starfire Sports",
  ].join("\t");

  it("reads a played fixture whole", () => {
    const { matches, skipped } = parsePastedSchedule(
      `Fri, Sep 4, 2026\t42 Games\n${row}`,
      options,
    );

    expect(skipped).toEqual([]);
    expect(matches).toEqual([
      {
        division: "Boys U14 White",
        date: "2026-09-04",
        time: "16:00",
        group: "A",
        field: "Field 1 Starfire Sports",
        home: "IFC B14 Red",
        away: "Nido Aguila Seattle B12/13",
        homeScore: 1,
        awayScore: 7,
      },
    ]);
  });

  it("carries the date heading down the rows under it", () => {
    const text = [
      "Fri, Sep 4, 2026\t42 Games",
      row,
      "Sat, Sep 5, 2026\t130 Games",
      row.replace("4:00 PM", "8:20 AM"),
    ].join("\n");

    const { matches } = parsePastedSchedule(text, options);
    expect(matches.map((m) => m.date)).toEqual(["2026-09-04", "2026-09-05"]);
  });

  it("leaves an unplayed game without a score rather than a 0-0", () => {
    // The difference between "nil-nil" and "has not kicked off" is the whole
    // table: a 0-0 that never happened gives both teams a point.
    const { matches } = parsePastedSchedule(
      row.replace("\t1\t7\t", "\t-\t-\t"),
      options,
    );
    expect(matches[0].homeScore).toBeNull();
    expect(matches[0].awayScore).toBeNull();
  });

  it("keeps a placeholder final as its two placeholders", () => {
    const final = [
      "1:00 PM Boys U13 Blue Final Boys U13 Championships",
      "Boys U13 Blue - Group A - (1st Place)",
      "-",
      "-",
      "Boys U13 Blue - Group B - (1st Place)",
      "Field 5 Starfire Sports",
    ].join("\t");

    const { matches } = parsePastedSchedule(final, options);
    expect(matches[0].home).toBe("Boys U13 Blue - Group A - (1st Place)");
    expect(matches[0].away).toBe("Boys U13 Blue - Group B - (1st Place)");
    expect(matches[0].homeScore).toBeNull();
  });

  it("reads a single combined score cell too", () => {
    const other = ["9:05 AM", "Crossfire B10", "7 - 0", "Leon FC U10", "60A #17"].join("\t");
    const { matches } = parsePastedSchedule(other, options);
    expect([matches[0].homeScore, matches[0].awayScore]).toEqual([7, 0]);
  });

  it("falls back to the division the person said they were pasting", () => {
    const bare = ["10:00 AM", "Team A", "1", "2", "Team B"].join("\t");
    expect(parsePastedSchedule(bare, options).matches[0].division).toBe("Unassigned");
  });

  it("ignores a header row without calling it a dropped fixture", () => {
    const { matches, skipped } = parsePastedSchedule(
      `GAME\tHOME TEAM\tAWAY TEAM\tLOCATION\n${row}`,
      options,
    );
    expect(matches).toHaveLength(1);
    expect(skipped).toEqual([]);
  });

  it("reports a line it could not read instead of dropping it silently", () => {
    // The failure that must never be quiet: a row we skipped looks exactly
    // like a game that was not scheduled.
    const { matches, skipped } = parsePastedSchedule("4:00 PM\tOnly One Team\t\t", options);
    expect(matches).toEqual([]);
    expect(skipped).toEqual(["4:00 PM\tOnly One Team"]);
  });
});

describe("toSyncedEvent", () => {
  const { matches } = parsePastedSchedule(
    [
      "Fri, Sep 4, 2026\t42 Games",
      "4:00 PM A1 vs A4 Boys U14 White\tIFC B14 Red\t1\t7\tNido Aguila Seattle B12/13\tField 1",
      "5:30 PM A2 vs A6 Boys U14 White\tKAFC Boys U-14 White\t1\t3\tSkagit FC\tField 3",
      "Mon, Sep 7, 2026\t60 Games",
      "1:00 PM Boys U14 Blue Final Boys U14 Championships\tBoys U14 Blue - Group A - (1st Place)\t-\t-\tBoys U14 Blue - Group B - (1st Place)\tField 6",
    ].join("\n"),
    options,
  );

  it("makes a team out of every real name, once", () => {
    const data = toSyncedEvent(matches);
    expect(data.teams.map((t) => t.name).sort()).toEqual([
      "IFC B14 Red",
      "KAFC Boys U-14 White",
      "Nido Aguila Seattle B12/13",
      "Skagit FC",
    ]);
  });

  it("does not make a team out of a placeholder", () => {
    // "(1st Place)" in the team list, and in the standings, would be a
    // phantom that never played a game.
    const data = toSyncedEvent(matches);
    expect(data.teams.some((t) => isPlaceholderName(t.name))).toBe(false);

    const final = data.matches.find((m) => m.division.includes("Championships"))!;
    expect(final.homeTeamId).toBeNull();
    expect(final.homeName).toContain("(1st Place)");
  });

  it("gives a fixture a key that survives the kick-off moving", () => {
    // A game rescheduled from 4:00 to 4:30 is the same game. Keying on the
    // time would delete it and insert a stranger.
    const moved = matches.map((m) => ({ ...m, time: "18:00" }));
    expect(toSyncedEvent(moved).matches.map((m) => m.sourceMatchId)).toEqual(
      toSyncedEvent(matches).matches.map((m) => m.sourceMatchId),
    );
  });

  it("collapses a row pasted twice", () => {
    const data = toSyncedEvent([...matches, ...matches]);
    expect(data.matches).toHaveLength(matches.length);
  });
});
