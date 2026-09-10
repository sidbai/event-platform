import { describe, expect, it } from "vitest";

import { blocking, preflight } from "./preflight";
import type { PlannedTeam } from "./planned-team";

const club = {
  id: "harbor",
  name: "Harbor Soccer Club",
  slug: "harbor-soccer-club",
  shortName: null,
  aliases: [],
};

const team = (over: Partial<PlannedTeam>): PlannedTeam => ({
  published: "Harbor SC",
  written: "Harbor Soccer Club B13/14",
  division: "U13",
  club,
  facts: { birthYears: [2013, 2014], gender: "boys", tier: null, program: null },
  ...over,
});

describe("preflight", () => {
  it("names the teams the directory has no club for", () => {
    /*
     * The Elite Academy case: nine ALBION teams went under a club in
     * Portland because that was the only ALBION the matcher could reach, and
     * it took reading a fixture list to notice.
     */
    const report = preflight([team({}), team({ published: "ALBION SC Hawaii", club: null })]);
    expect(report.homeless).toEqual([{ published: "ALBION SC Hawaii", division: "U13" }]);
    expect(blocking(report)).toBe(true);
  });

  it("counts a name two teams would share", () => {
    // Seven ages of one club, all called the same thing, is what a league
    // whose team names carry no age looks like when it lands.
    const report = preflight([
      team({ division: "U12" }),
      team({ division: "U13" }),
    ]);
    expect(report.shared).toEqual([{ name: "Harbor Soccer Club B13/14", count: 2 }]);
  });

  it("catches a division holding two cohorts", () => {
    const report = preflight([
      team({}),
      team({
        written: "Harbor Soccer Club B12/13",
        facts: { birthYears: [2012, 2013], gender: "boys", tier: null, program: null },
      }),
    ]);
    expect(report.mixed).toEqual([{ division: "U13", cohorts: ["2012/2013", "2013/2014"] }]);
    /*
     * Reported, not blocking. Crossfire enter "XF U7 B19-20 RCL 1" in the
     * Sports Affinity U8 flight; the team's own name is the better authority
     * on what the team is, and three of eighteen flights look like that.
     */
    expect(blocking(report)).toBe(false);
  });

  it("catches a name that would not read back as itself", () => {
    /*
     * Written once and different on the second reading — which makes the
     * rename dry run, the only check on a rewrite, impossible to check.
     * Here the written name is not what the facts would produce.
     */
    const report = preflight([team({ written: "Harbor Soccer Club" })]);
    expect(report.unstable).toEqual([
      { written: "Harbor Soccer Club", reread: "Harbor Soccer Club B13/14" },
    ]);
  });

  it("says nothing is wrong when nothing is", () => {
    const report = preflight([team({}), team({ division: "U12", written: "Harbor Soccer Club B14/15", facts: { birthYears: [2014, 2015], gender: "boys", tier: null, program: null } })]);
    expect(blocking(report)).toBe(false);
    expect(report.clubs).toEqual([{ name: "Harbor Soccer Club", teams: 2 }]);
  });
});
