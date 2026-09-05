import { describe, expect, it } from "vitest";

import {
  canRemoveReply,
  canReplyToReview,
  canRequestClaim,
  canReviewCoach,
  isTheCoach,
  type CoachSubject,
  type Viewer,
} from "./claim";

const dana: Viewer = { id: "u-dana", admin: false };
const parent: Viewer = { id: "u-parent", admin: false };
const admin: Viewer = { id: "u-admin", admin: true };

const unclaimed: CoachSubject = { id: "c1", claimedBy: null };
const claimed: CoachSubject = { id: "c1", claimedBy: "u-dana" };

describe("isTheCoach", () => {
  it("is only true for the confirmed holder", () => {
    expect(isTheCoach(claimed, dana)).toBe(true);
    expect(isTheCoach(claimed, parent)).toBe(false);
    expect(isTheCoach(claimed, null)).toBe(false);
  });

  it("is never true on an unclaimed page", () => {
    // Two nulls must not match each other into a claim.
    expect(isTheCoach(unclaimed, dana)).toBe(false);
    expect(isTheCoach(unclaimed, { id: "", admin: false })).toBe(false);
  });

  it("does not treat an admin as the coach", () => {
    expect(isTheCoach(claimed, admin)).toBe(false);
  });
});

describe("canRequestClaim", () => {
  it("lets a signed-in stranger ask on a free page", () => {
    expect(canRequestClaim(unclaimed, parent, null)).toBe(true);
  });

  it("refuses when someone already holds it", () => {
    expect(canRequestClaim(claimed, parent, null)).toBe(false);
  });

  it("refuses a second ask, however the first went", () => {
    for (const s of ["pending", "approved", "rejected"] as const) {
      expect(canRequestClaim(unclaimed, parent, s)).toBe(false);
    }
  });

  it("refuses signed out", () => {
    expect(canRequestClaim(unclaimed, null, null)).toBe(false);
  });
});

describe("canReplyToReview", () => {
  it("is the coach's alone", () => {
    expect(canReplyToReview(claimed, dana)).toBe(true);
    expect(canReplyToReview(claimed, parent)).toBe(false);
  });

  it("is not an admin power — a reply carries the coach's name", () => {
    expect(canReplyToReview(claimed, admin)).toBe(false);
  });

  it("does not exist before the page is claimed", () => {
    expect(canReplyToReview(unclaimed, dana)).toBe(false);
  });
});

describe("canRemoveReply", () => {
  it("lets the author take their own reply down", () => {
    expect(canRemoveReply("u-dana", dana)).toBe(true);
  });

  it("lets an admin moderate one", () => {
    expect(canRemoveReply("u-dana", admin)).toBe(true);
  });

  it("lets nobody else", () => {
    expect(canRemoveReply("u-dana", parent)).toBe(false);
    expect(canRemoveReply("u-dana", null)).toBe(false);
  });
});

describe("canReviewCoach", () => {
  it("stops a coach reviewing themselves", () => {
    // There is no work-email equivalent here, so the claim is the only signal
    // we have that someone is the subject.
    expect(canReviewCoach(claimed, dana)).toBe(false);
  });

  it("still lets everyone else review them", () => {
    expect(canReviewCoach(claimed, parent)).toBe(true);
    expect(canReviewCoach(claimed, admin)).toBe(true);
  });

  it("lets anyone review an unclaimed coach", () => {
    expect(canReviewCoach(unclaimed, dana)).toBe(true);
  });
});
