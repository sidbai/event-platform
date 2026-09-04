import { describe, expect, it } from "vitest";

import {
  averageRatings,
  overallOf,
  parseRating,
  RATING_CATEGORIES,
  type Ratings,
} from "./constants";

const r = (n: number): Ratings => ({
  playerDevelopment: n,
  coaching: n,
  communication: n,
  clubCulture: n,
  playingTime: n,
  value: n,
});

describe("overallOf", () => {
  it("averages the six scales", () => {
    expect(overallOf(r(4))).toBe(4);
    expect(overallOf({ ...r(5), value: 1 })).toBeCloseTo((5 * 5 + 1) / 6);
  });
});

describe("averageRatings", () => {
  it("returns null with nothing to average, rather than NaN", () => {
    // a club with no reviews must not render "NaN stars"
    expect(averageRatings([])).toBeNull();
  });

  it("averages per category and overall", () => {
    const got = averageRatings([r(5), r(3)])!;
    expect(got.count).toBe(2);
    expect(got.overall).toBe(4);
    for (const { key } of RATING_CATEGORIES) expect(got.byCategory[key]).toBe(4);
  });

  it("keeps categories independent", () => {
    const got = averageRatings([
      { ...r(5), coaching: 1 },
      { ...r(5), coaching: 3 },
    ])!;
    expect(got.byCategory.coaching).toBe(2);
    expect(got.byCategory.value).toBe(5);
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

describe("rating threshold", () => {
  const r = (n: number): Ratings => ({
    playerDevelopment: n,
    coaching: n,
    communication: n,
    clubCulture: n,
    playingTime: n,
    value: n,
  });

  it("withholds a score below the threshold", () => {
    expect(averageRatings([r(5)])?.rated).toBe(false);
    expect(averageRatings([r(5), r(1)])?.rated).toBe(false);
  });

  it("publishes one at the threshold and above", () => {
    expect(averageRatings([r(4), r(4), r(4)])?.rated).toBe(true);
    expect(averageRatings([r(4), r(4), r(4), r(2)])?.rated).toBe(true);
  });

  it("still computes the average, so it is display policy not data loss", () => {
    // A single 5 star review must not read as a 5.0 club, but the number is
    // still there for admins and for the moment it crosses the threshold.
    expect(averageRatings([r(5)])?.overall).toBe(5);
    expect(averageRatings([r(5)])?.count).toBe(1);
  });

  it("has no score at all with no reviews", () => {
    expect(averageRatings([])).toBeNull();
  });
});
