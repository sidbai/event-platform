import { describe, expect, it } from "vitest";

import { crestOf } from "./crest";

describe("crestOf", () => {
  it("prefers the team's own", () => {
    expect(crestOf({ crestUrl: "own.png", club: { crestUrl: "club.png" } })).toBe(
      "own.png",
    );
  });

  it("falls back to the club's", () => {
    // The ordinary case: an imported team has no crest and its club does.
    expect(crestOf({ crestUrl: null, club: { crestUrl: "club.png" } })).toBe("club.png");
  });

  it("has nothing to show for a team with no club", () => {
    expect(crestOf({ crestUrl: null, club: null })).toBeNull();
    expect(crestOf({ crestUrl: null })).toBeNull();
  });

  it("takes a missing team without complaining", () => {
    // Called on the away side of a fixture whose opponent is still "TBD".
    expect(crestOf(null)).toBeNull();
    expect(crestOf(undefined)).toBeNull();
  });
});
