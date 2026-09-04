import { describe, expect, it } from "vitest";

import { COACH_SCALES, type Ratings } from "@/features/reviews/constants";

import { validateCoachReview, type CoachReviewInput } from "./review-rules";

const ratings: Ratings = Object.fromEntries(
  COACH_SCALES.map((s) => [s.key, 4]),
);

const good = (over: Partial<CoachReviewInput> = {}): CoachReviewInput => ({
  ratings,
  reviewerRole: "parent",
  season: "2025-26",
  recommends: true,
  title: "A good season overall",
  body: "Sessions were well planned and my daughter improved a lot through the winter block.",
  teamLabel: "Boys 2013",
  yearsWith: 2,
  ...over,
});

describe("validateCoachReview", () => {
  it("accepts a complete review", () => {
    expect(validateCoachReview(good())).toEqual({});
  });

  describe("reviewer anonymity", () => {
    // A squad is around fifteen families. Requiring the team, or how long you
    // were with the coach, narrows the author far enough that the coach could
    // guess who wrote it — so neither may ever be required.
    it("accepts a review with no team named", () => {
      expect(validateCoachReview(good({ teamLabel: "" }))).toEqual({});
    });

    it("accepts a review with no tenure given", () => {
      expect(validateCoachReview(good({ yearsWith: null }))).toEqual({});
    });

    it("accepts a review with neither", () => {
      expect(
        validateCoachReview(good({ teamLabel: "", yearsWith: null })),
      ).toEqual({});
    });
  });

  describe("what stays required", () => {
    // These date and frame the review without pointing at a family.
    it("needs a season", () => {
      expect(validateCoachReview(good({ season: "" })).season).toBeTruthy();
    });

    it("needs the reviewer's relationship to the coach", () => {
      expect(
        validateCoachReview(good({ reviewerRole: null })).reviewerRole,
      ).toBeTruthy();
    });

    it("needs a recommendation either way", () => {
      expect(validateCoachReview(good({ recommends: null })).recommends).toBeTruthy();
      // false is an answer, not a missing one
      expect(validateCoachReview(good({ recommends: false }))).toEqual({});
    });

    it("needs every rating", () => {
      expect(validateCoachReview(good({ ratings: null })).ratings).toBeTruthy();
    });
  });

  describe("the written review", () => {
    it("rejects a stub headline or body", () => {
      expect(validateCoachReview(good({ title: "ok" })).title).toBeTruthy();
      expect(validateCoachReview(good({ body: "bad coach" })).body).toBeTruthy();
    });

    it("rejects an overlong one", () => {
      expect(validateCoachReview(good({ title: "x".repeat(121) })).title).toBeTruthy();
      expect(validateCoachReview(good({ body: "x".repeat(4001) })).body).toBeTruthy();
    });
  });
});
