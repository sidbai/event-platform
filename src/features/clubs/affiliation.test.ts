import { describe, expect, it } from "vitest";

import { affiliationValue, parseAffiliation, UNKNOWN } from "./affiliation";

const CLUBS = ["c1", "c2"];

describe("parseAffiliation", () => {
  it("records a club by id", () => {
    expect(parseAffiliation("c1", CLUBS)).toEqual({
      affiliation: "club",
      clubId: "c1",
    });
  });

  it("records a team formed outside any club", () => {
    /*
     * The King Juan Cup case: a side put together for the tournament, with no
     * club above it. It must be distinguishable from an imported team nobody
     * has matched yet, or it sits in the review queue forever.
     */
    expect(parseAffiliation("independent", CLUBS)).toEqual({
      affiliation: "independent",
      clubId: null,
    });
  });

  it("treats an unanswered question as unanswered", () => {
    expect(parseAffiliation("", CLUBS)).toEqual(UNKNOWN);
    expect(parseAffiliation(null, CLUBS)).toEqual(UNKNOWN);
    expect(parseAffiliation("   ", CLUBS)).toEqual(UNKNOWN);
  });

  it("does not trust an id it has never heard of", () => {
    // club_id is a foreign key; a made-up id would be an insert that throws.
    expect(parseAffiliation("c9", CLUBS)).toEqual(UNKNOWN);
  });

  it("never returns a state the CHECK constraint forbids", () => {
    // (affiliation = 'club') = (club_id IS NOT NULL), asserted for every path.
    for (const v of ["c1", "c2", "independent", "", "nope", null]) {
      const a = parseAffiliation(v, CLUBS);
      expect(a.affiliation === "club").toBe(a.clubId !== null);
    }
  });
});

describe("affiliationValue", () => {
  it("round-trips every answer", () => {
    for (const v of ["c1", "independent", ""]) {
      expect(affiliationValue(parseAffiliation(v, CLUBS))).toBe(v);
    }
  });
});
