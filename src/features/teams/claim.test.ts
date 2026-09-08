import { describe, expect, it } from "vitest";

import {
  CLAIMED_ROLE,
  CLAIM_NOTE_MIN,
  blocksMerge,
  canDecideClaim,
  canRequestClaim,
  checkClaimNote,
  claimRefusal,
} from "./claim";

const team = (over: Partial<Parameters<typeof claimRefusal>[0]> = {}) => ({
  id: "t1",
  ownerId: null,
  visibility: "public",
  ...over,
});

const coach = { id: "u1", admin: false };
const admin = { id: "u2", admin: true };

describe("claimRefusal", () => {
  it("lets a signed-in person ask for an unheld team", () => {
    expect(claimRefusal(team(), coach, null)).toBeNull();
    expect(canRequestClaim(team(), coach, null)).toBe(true);
  });

  it("refuses somebody with no account, because a claim needs a claimant", () => {
    expect(claimRefusal(team(), null, null)).toBe("Sign in to claim a team.");
  });

  it("refuses a team somebody already holds", () => {
    expect(claimRefusal(team({ ownerId: "u9" }), coach, null)).toBe(
      "Somebody already manages this team.",
    );
  });

  it("refuses a private team, whatever the owner column says", () => {
    // Private is already a decision by a person — either they created it that
    // way or they hid it since. A claim would step over it.
    expect(claimRefusal(team({ visibility: "private" }), coach, null)).toBe(
      "This team is private.",
    );
  });

  it("says which of the three ways an existing claim ended", () => {
    expect(claimRefusal(team(), coach, "pending")).toMatch(/waiting for review/);
    expect(claimRefusal(team(), coach, "approved")).toMatch(/already manage/);
    expect(claimRefusal(team(), coach, "rejected")).toMatch(/declined/);
  });

  it("does not let a refusal be re-asked", () => {
    // Otherwise the queue is worn down by whoever asks the most times.
    expect(canRequestClaim(team(), coach, "rejected")).toBe(false);
  });

  it("gives an admin no shortcut through the request itself", () => {
    // Admins decide claims; they do not skip the queue by making one that
    // approves itself.
    expect(canRequestClaim(team(), admin, "pending")).toBe(false);
  });
});

describe("checkClaimNote", () => {
  it("takes a note that says who somebody is", () => {
    const out = checkClaimNote("  I coach Eastside FC GU12   Red — reachable at the club  ");
    expect(out).toEqual({
      ok: true,
      note: "I coach Eastside FC GU12 Red — reachable at the club",
    });
  });

  it("refuses a note too short to check anything against", () => {
    // With no email on the platform, this sentence is all an admin has.
    expect(checkClaimNote("its mine").ok).toBe(false);
    expect(checkClaimNote("x".repeat(CLAIM_NOTE_MIN - 1)).ok).toBe(false);
    expect(checkClaimNote("x".repeat(CLAIM_NOTE_MIN)).ok).toBe(true);
  });

  it("refuses one nobody will read", () => {
    expect(checkClaimNote("x".repeat(501)).ok).toBe(false);
  });

  it("counts what is left after the whitespace, not what was typed", () => {
    expect(checkClaimNote(`   ${" ".repeat(40)}   `).ok).toBe(false);
  });
});

describe("what a claim grants", () => {
  it("is manager, not owner", () => {
    // Enough to run the team; short of deleting it or hiding it from the
    // directory, so a wrong approval stays recoverable.
    expect(CLAIMED_ROLE).toBe("manager");
  });

  it("is decided by admins alone", () => {
    expect(canDecideClaim(admin)).toBe(true);
    expect(canDecideClaim(coach)).toBe(false);
    expect(canDecideClaim(null)).toBe(false);
  });
});

describe("blocksMerge", () => {
  it("says a held team can no longer be folded away", () => {
    // The same rule mergeTeams enforces. Named here so the admin screen can
    // explain the refusal instead of surfacing an error.
    expect(blocksMerge(team({ ownerId: "u9" }))).toBe(true);
    expect(blocksMerge(team())).toBe(false);
  });
});
