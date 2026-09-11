import { describe, expect, it } from "vitest";

import {
  acronymPairs,
  auditTeam,
  groupFindings,
  initialsOf,
  looksLikeInitials,
  type AuditTeam,
} from "./audit";
import { EMPTY_PROFILE, type ClubProfile } from "./profile";

const profile = (over: Partial<ClubProfile> = {}): ClubProfile => ({
  ...EMPTY_PROFILE,
  slug: "x",
  readAt: "2026-09-11T00:00:00.000Z",
  model: "test",
  ...over,
});

const team = (name: string, over: Partial<AuditTeam> = {}): AuditTeam => ({
  slug: "t",
  name,
  clubSlug: "x",
  clubNames: ["Example FC"],
  birthYears: [2014],
  ...over,
});

describe("auditTeam", () => {
  it("says nothing when every word is accounted for", () => {
    expect(
      auditTeam(team("Example FC B14/15 Red"), profile({ squadMarkers: ["Red"] })),
    ).toEqual([]);
  });

  it("reports a word the club's profile has never heard of", () => {
    const [finding] = auditTeam(team("Example FC B14/15 Chartreuse"), profile({ tiers: ["Red"] }));
    expect(finding).toMatchObject({ check: "unknown-word", about: "Chartreuse" });
  });

  /*
   * The audit's loudest finding was once itself: 117 Western WA Surf teams
   * are published as "WW Surf" and every Crossfire side as "XF", and it
   * reported the club's own short name as a word nobody had heard of.
   */
  it("knows the club by its short name and its aliases", () => {
    expect(
      auditTeam(
        team("WW Surf B10/11 EA", { clubNames: ["Western Washington Surf", "WW Surf"] }),
        profile({ tiers: ["EA League"] }),
      ),
    ).toEqual([]);
  });

  it("strips the longest name first, so Surf does not survive Western WA Surf", () => {
    expect(
      auditTeam(
        team("Western Washington Surf B12 Premier", { clubNames: ["Surf", "Western Washington Surf"] }),
        profile({ tiers: ["Premier"] }),
      ),
    ).toEqual([]);
  });

  it("treats every way of writing an age as an age", () => {
    for (const name of ["Example FC B14/15", "Example FC GU12", "Example FC 2013", "Example FC U-9"]) {
      expect(auditTeam(team(name), profile())).toEqual([]);
    }
  });

  it("leaves squad marks to the rule that owns them", () => {
    // teams/match-plan.ts refuses 47 pairs on exactly these; a second rule
    // complaining about them is 150 findings nobody should act on.
    for (const name of ["Example FC B14 A", "Example FC B14 2", "Example FC B14 II"]) {
      expect(auditTeam(team(name), profile())).toEqual([]);
    }
  });

  it("matches a vocabulary entry by any of its words", () => {
    // "Elite Academy (EA)" in the profile should account for a name saying EA.
    expect(auditTeam(team("Example FC B14 EA"), profile({ tiers: ["Elite Academy (EA)"] }))).toEqual([]);
  });

  it("reports a team with no club, and asks nothing else of it", () => {
    expect(auditTeam(team("Someone B14 Red", { clubSlug: null }), null)).toEqual([
      { check: "no-club", team: "Someone B14 Red", clubSlug: null, about: "unfiled" },
    ]);
  });

  it("reports a club nothing has been read about, once", () => {
    expect(auditTeam(team("Example FC B14 Red Blue Green"), null)).toHaveLength(1);
  });

  it("counts a repeated word once", () => {
    expect(auditTeam(team("Example FC Red B14 Red"), profile())).toHaveLength(1);
  });
});

describe("groupFindings", () => {
  it("orders by how often a thing happens, because that is the signal", () => {
    const findings = [
      ...Array.from({ length: 3 }, (_, i) => ({
        check: "unknown-word" as const, team: `t${i}`, clubSlug: "x", about: "Green",
      })),
      { check: "unknown-word" as const, team: "t9", clubSlug: "x", about: "Puce" },
    ];
    const [first, second] = groupFindings(findings);
    expect(first).toMatchObject({ about: "Green", count: 3 });
    expect(first.examples).toEqual(["t0", "t1", "t2"]);
    expect(second).toMatchObject({ about: "Puce", count: 1 });
  });

  it("groups case-insensitively, but keeps the club apart", () => {
    expect(
      groupFindings([
        { check: "unknown-word", team: "a", clubSlug: "x", about: "Red" },
        { check: "unknown-word", team: "b", clubSlug: "x", about: "red" },
        { check: "unknown-word", team: "c", clubSlug: "y", about: "Red" },
      ]),
    ).toHaveLength(2);
  });
});

describe("acronymPairs", () => {
  /*
   * The pair this exists for. "FME SC" held seventeen teams and "Fife Milton
   * Edgewood SC" three, and nothing could see they were one club: every other
   * rule compares words, and these two names share none.
   */
  const fme = { slug: "fme-sc", name: "FME SC", teams: 17 };
  const fife = { slug: "fife-milton-edgewood-sc", name: "Fife Milton Edgewood SC", teams: 3 };

  it("finds a club held twice, once as initials", () => {
    expect(acronymPairs([fme, fife])).toEqual([{ acronym: fme, spelledOut: fife }]);
  });

  it("ignores the soccer furniture in both names", () => {
    expect(initialsOf("Fife Milton Edgewood SC")).toBe("FME");
    expect(initialsOf("FME SC")).toBe("FME");
  });

  it("refuses two letters, which would match half the directory", () => {
    expect(
      acronymPairs([
        { slug: "tc", name: "TC", teams: 4 },
        { slug: "tacoma-city", name: "Tacoma City", teams: 9 },
      ]),
    ).toEqual([]);
  });

  it("does not call a real word initials", () => {
    expect(looksLikeInitials("Valor")).toBe(false);
    expect(looksLikeInitials("FME SC")).toBe(true);
    expect(looksLikeInitials("Seattle United")).toBe(false);
  });

  it("offers the bigger pair first, since that is the one worth reading", () => {
    const [first] = acronymPairs([
      { slug: "abc", name: "ABC", teams: 1 },
      { slug: "a-b-c", name: "Alpha Bravo Charlie", teams: 1 },
      fme,
      fife,
    ]);
    expect(first.acronym.name).toBe("FME SC");
  });
});
