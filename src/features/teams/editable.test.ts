import { describe, expect, it } from "vitest";

import {
  freeFields,
  lockedBecause,
  policyFor,
  proposableFields,
  type TeamField,
} from "./editable";

const clubTeam = { affiliation: "club" };
const imported = { affiliation: "unknown" };
const independent = { affiliation: "independent" };

const claimant = { kind: "claimant" } as const;
const admin = { kind: "admin" } as const;

describe("a club's team", () => {
  it("keeps its identity with the club, not with whoever runs it", () => {
    // Eastside FC GU12 Red is the same team when every player has moved on.
    for (const field of [
      "club",
      "birthYears",
      "gender",
      "tier",
      "program",
      "city",
      "crest",
    ] as TeamField[]) {
      expect(policyFor(field, clubTeam, claimant)).toBe("locked");
    }
  });

  it("lets the claimant run it", () => {
    expect(policyFor("bio", clubTeam, claimant)).toBe("free");
  });

  it("takes a new name only as a proposal", () => {
    // The imported names are platform output — "XF, U14, B12 - 13, RCL 1,
    // Plackov" — so somebody has to be able to fix them, and it should not be
    // silently.
    expect(policyFor("name", clubTeam, claimant)).toBe("review");
    expect(proposableFields(clubTeam, claimant)).toEqual(["name"]);
  });
});

describe("a team nobody has placed in a club yet", () => {
  it("lets the claimant complete it, because they are who knows", () => {
    // 'unknown' is the imported majority. The coach claiming one is usually
    // the only person who can say which club it is.
    expect(policyFor("club", imported, claimant)).toBe("free");
    expect(policyFor("tier", imported, claimant)).toBe("free");
  });

  it("closes once the club is named", () => {
    expect(policyFor("club", clubTeam, claimant)).toBe("locked");
  });

  it("still reviews the name", () => {
    // One rule for names, whatever the affiliation: it is what every fixture,
    // table and search result shows.
    expect(policyFor("name", imported, claimant)).toBe("review");
    expect(policyFor("name", independent, claimant)).toBe("review");
  });
});

describe("a team formed outside any club", () => {
  it("is the claimant's to describe", () => {
    // A King Juan Cup side exists for one tournament; whoever runs it defines
    // it, and there is no club whose facts could be misstated.
    expect(policyFor("gender", independent, claimant)).toBe("free");
    expect(policyFor("crest", independent, claimant)).toBe("free");
  });
});

describe("visibility", () => {
  it("is nobody's but an admin's", () => {
    // It used to ride along with the rest of the form, which meant an
    // approved claim could take a team with a season of results out of the
    // directory — which from outside looks exactly like it never existed.
    for (const team of [clubTeam, imported, independent]) {
      expect(policyFor("visibility", team, claimant)).toBe("locked");
    }
    expect(lockedBecause("visibility", clubTeam)).toMatch(/admin/i);
  });

  it("is never in the free list, for any kind of team", () => {
    for (const team of [clubTeam, imported, independent]) {
      expect(freeFields(team, claimant)).not.toContain("visibility");
    }
  });
});

describe("an admin", () => {
  it("can write anything, because otherwise a bad import has no way out", () => {
    for (const team of [clubTeam, imported, independent]) {
      for (const field of ["name", "club", "crest", "visibility"] as TeamField[]) {
        expect(policyFor(field, team, admin)).toBe("free");
      }
    }
    expect(proposableFields(clubTeam, admin)).toEqual([]);
  });
});

describe("lockedBecause", () => {
  it("names who does get to change it", () => {
    // A disabled input with no explanation reads as a bug to the one person
    // who most deserves an answer.
    expect(lockedBecause("tier", clubTeam)).toMatch(/club/i);
  });
});
