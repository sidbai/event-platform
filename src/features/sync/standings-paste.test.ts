import { describe, expect, it } from "vitest";

import { parsePastedStandings, readStandingsHeader } from "./standings-paste";

describe("readStandingsHeader", () => {
  it("reads the names platforms actually print", () => {
    for (const header of [
      "Team\tGP\tW\tD\tL\tGF\tGA\tPTS",
      "TEAM NAME\tPlayed\tWins\tTies\tLosses\tGoals For\tGoals Against\tPoints",
      "#\tClub\tMP\tW\tT\tL\tGS\tGC\tPts",
    ]) {
      expect(readStandingsHeader(header), header).not.toBeNull();
    }
  });

  it("refuses a schedule, which is also a table", () => {
    // The paste box takes both kinds. Reading a fixture list as standings
    // would attach scores to teams as if they were season totals.
    expect(readStandingsHeader("date\ttime\tdivision\thome\taway\tfield")).toBeNull();
  });

  it("refuses a table with no points column", () => {
    // A list of games played is not a standing, and treating it as one puts
    // every team on zero.
    expect(readStandingsHeader("Team\tGP\tW\tD\tL")).toBeNull();
  });

  it("will not guess at a bare P", () => {
    /*
     * "P" is played on one platform and points on another. Guessing wrong
     * gives every team a points total equal to their games played, which
     * looks entirely plausible on screen and is completely wrong.
     */
    const header = readStandingsHeader("Team\tP\tW\tD\tL\tGF\tGA");
    expect(header).toBeNull();
  });
});

describe("parsePastedStandings", () => {
  const table = [
    "Team\tGP\tW\tD\tL\tGF\tGA\tPTS",
    "Crossfire Select B-U10 A Matisz\t3\t2\t1\t0\t9\t3\t7",
    "Leon FC U10 premier\t3\t1\t1\t1\t5\t5\t4",
    "XF U10 RCL 2\t3\t0\t0\t3\t2\t8\t0",
  ].join("\n");

  it("reads each column by its name, not its place", () => {
    const { rows, skipped } = parsePastedStandings(table);
    expect(skipped).toEqual([]);
    expect(rows[0]).toEqual({
      team: "Crossfire Select B-U10 A Matisz",
      played: 3,
      won: 2,
      drawn: 1,
      lost: 0,
      gf: 9,
      ga: 3,
      points: 7,
    });
  });

  it("keeps the order the organizer published", () => {
    // Their order encodes their tiebreakers, which is the whole reason for
    // taking their table instead of computing one.
    expect(parsePastedStandings(table).rows.map((r) => r.team)).toEqual([
      "Crossfire Select B-U10 A Matisz",
      "Leon FC U10 premier",
      "XF U10 RCL 2",
    ]);
  });

  it("survives a different column order without reordering anything", () => {
    const reordered = [
      "Pts\tTeam\tW\tL\tT\tGP",
      "7\tCrossfire Select B-U10 A Matisz\t2\t0\t1\t3",
    ].join("\n");
    const [row] = parsePastedStandings(reordered).rows;
    expect(row.points).toBe(7);
    expect(row.won).toBe(2);
    expect(row.played).toBe(3);
    expect(row.gf).toBeNull();
  });

  it("keeps a team that has not played rather than dropping it", () => {
    const withNewcomer = `${table}\nA Late Entry\t0\t0\t0\t0\t0\t0\t0`;
    expect(parsePastedStandings(withNewcomer).rows).toHaveLength(4);
  });

  it("reports what it could not read instead of quietly losing it", () => {
    const { rows, skipped } = parsePastedStandings(
      "Group A standings\nTeam\tGP\tW\tD\tL\tGF\tGA\tPTS\n\t3\t2\t1\t0\t9\t3\t7",
    );
    expect(rows).toEqual([]);
    expect(skipped).toHaveLength(2);
  });
});
