import { describe, expect, it } from "vitest";

import { needsAdminReview } from "./review-rule";

describe("needsAdminReview", () => {
  it("holds a public event from someone who is not an admin", () => {
    expect(needsAdminReview("pickup", "public", false)).toBe(true);
  });

  it("lets a private pickup game through", () => {
    // Nothing reaches the public list, so waiting would only stop the
    // organizer inviting the people they already have in mind.
    expect(needsAdminReview("pickup", "private", false)).toBe(false);
    expect(needsAdminReview("scrimmage", "unlisted", false)).toBe(false);
  });

  it("holds a tournament or league whatever its visibility", () => {
    // These take entries from other people's teams and get a page of their
    // own. Private only limits who was told, not what it is.
    for (const kind of ["tournament", "league"]) {
      for (const visibility of ["public", "unlisted", "private"]) {
        expect(needsAdminReview(kind, visibility, false)).toBe(true);
      }
    }
  });

  it("never holds an admin's own submission", () => {
    expect(needsAdminReview("tournament", "public", true)).toBe(false);
    expect(needsAdminReview("league", "private", true)).toBe(false);
  });
});
