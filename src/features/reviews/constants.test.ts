import { describe, expect, it } from "vitest";

import {
  averageRatings,
  CLUB_SCALES,
  COACH_SCALES,
  overallOf,
  parseRating,
  readRatings,
  reportReasonsFor,
  scalesFor,
  type Ratings,
} from "./constants";

const club = (n: number): Ratings => ({
  playerDevelopment: n,
  coaching: n,
  communication: n,
  clubCulture: n,
  playingTime: n,
  value: n,
});

const coach = (n: number): Ratings => ({
  playerDevelopment: n,
  communication: n,
  organization: n,
  professionalism: n,
  playingTime: n,
});

describe("scalesFor", () => {
  it("gives a coach different scales from a club", () => {
    expect(scalesFor("club")).toBe(CLUB_SCALES);
    expect(scalesFor("coach")).toBe(COACH_SCALES);
  });

  it("does not judge a coach on the club's money or culture", () => {
    const keys = COACH_SCALES.map((s) => s.key);
    expect(keys).not.toContain("value");
    expect(keys).not.toContain("clubCulture");
  });
});

describe("overallOf", () => {
  it("averages the club's six scales", () => {
    expect(overallOf("club", club(4))).toBe(4);
    expect(overallOf("club", { ...club(5), value: 1 })).toBeCloseTo((5 * 5 + 1) / 6);
  });

  it("averages the coach's five, ignoring club-only keys", () => {
    expect(overallOf("coach", coach(4))).toBe(4);
    // A stray club key must not drag a coach's average around.
    expect(overallOf("coach", { ...coach(4), value: 1 })).toBe(4);
  });

  it("returns 0 rather than NaN when a subject has no usable scales", () => {
    expect(overallOf("coach", {})).toBe(0);
  });
});

describe("averageRatings", () => {
  it("returns null with nothing to average, rather than NaN", () => {
    expect(averageRatings("club", [])).toBeNull();
    expect(averageRatings("coach", [])).toBeNull();
  });

  it("averages per scale and overall", () => {
    const got = averageRatings("club", [club(5), club(3)])!;
    expect(got.count).toBe(2);
    expect(got.overall).toBe(4);
    for (const { key } of CLUB_SCALES) expect(got.byScale[key]).toBe(4);
  });

  it("keeps scales independent", () => {
    const got = averageRatings("club", [
      { ...club(5), coaching: 1 },
      { ...club(5), coaching: 3 },
    ])!;
    expect(got.byScale.coaching).toBe(2);
    expect(got.byScale.value).toBe(5);
  });

  it("averages a coach over the coach scales only", () => {
    const got = averageRatings("coach", [coach(5), coach(3)])!;
    expect(Object.keys(got.byScale).sort()).toEqual(
      COACH_SCALES.map((s) => s.key).sort(),
    );
    expect(got.overall).toBe(4);
  });
});

describe("rating threshold", () => {
  it("withholds a score below the threshold", () => {
    expect(averageRatings("club", [club(5)])?.rated).toBe(false);
    expect(averageRatings("club", [club(5), club(1)])?.rated).toBe(false);
    // Matters most here: one angry parent must not be a coach's rating.
    expect(averageRatings("coach", [coach(1)])?.rated).toBe(false);
  });

  it("publishes one at the threshold and above", () => {
    expect(averageRatings("club", [club(4), club(4), club(4)])?.rated).toBe(true);
    expect(averageRatings("coach", [coach(4), coach(4), coach(4)])?.rated).toBe(true);
  });

  it("still computes the average, so it is display policy not data loss", () => {
    expect(averageRatings("club", [club(5)])?.overall).toBe(5);
    expect(averageRatings("club", [club(5)])?.count).toBe(1);
  });
});

describe("parseRating", () => {
  it("accepts whole stars only", () => {
    expect(parseRating("1")).toBe(1);
    expect(parseRating("5")).toBe(5);
  });

  it("rejects anything outside 1-5 or non-integral", () => {
    // the DB has a CHECK for this too; this is so the user sees a message
    for (const bad of ["0", "6", "-1", "3.5", "", "abc", null]) {
      expect(parseRating(bad)).toBeNull();
    }
  });
});

describe("readRatings", () => {
  const form = (entries: Record<string, string>) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(entries)) fd.set(k, v);
    return fd;
  };

  it("reads every scale the subject needs", () => {
    const fd = form(Object.fromEntries(COACH_SCALES.map((s) => [s.key, "4"])));
    expect(readRatings("coach", fd)).toEqual(coach(4));
  });

  it("refuses a partial set rather than scoring the gaps as zero", () => {
    const partial = Object.fromEntries(
      COACH_SCALES.slice(1).map((s) => [s.key, "4"]),
    );
    expect(readRatings("coach", form(partial))).toBeNull();
  });

  it("does not accept a club's answers for a coach", () => {
    const fd = form(Object.fromEntries(CLUB_SCALES.map((s) => [s.key, "4"])));
    // organization and professionalism are missing from a club form.
    expect(readRatings("coach", fd)).toBeNull();
  });
});

describe("reportReasonsFor", () => {
  it("gives coaches the person-not-coaching reason", () => {
    expect(reportReasonsFor("coach")).toContain(
      "About the person, not their coaching",
    );
  });

  it("does not put that reason on club reviews", () => {
    expect(reportReasonsFor("club")).not.toContain(
      "About the person, not their coaching",
    );
  });
});
