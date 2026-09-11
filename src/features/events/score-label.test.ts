import { describe, expect, it } from "vitest";

import { scoreLabel, winner } from "./score-label";

describe("scoreLabel", () => {
  it("prints a score, and the shootout beside it when there was one", () => {
    expect(scoreLabel({ homeScore: 2, awayScore: 1 })).toBe("2 – 1");
    expect(scoreLabel({ homeScore: 2, awayScore: 2, homePens: 4, awayPens: 3 })).toBe(
      "2 – 2 (4–3 pens)",
    );
    expect(scoreLabel({ homeScore: 1, awayScore: 1, homePens: 5, awayPens: 4 }, "–")).toBe(
      "1–1 (5–4 pens)",
    );
  });

  it("says nothing for a game not played", () => {
    expect(scoreLabel({ homeScore: null, awayScore: null })).toBeNull();
    expect(scoreLabel({ homeScore: 1, awayScore: null })).toBeNull();
  });
});

describe("winner", () => {
  it("reads the score, then the shootout", () => {
    expect(winner({ homeScore: 3, awayScore: 1 })).toBe("home");
    expect(winner({ homeScore: 0, awayScore: 1 })).toBe("away");
    expect(winner({ homeScore: 2, awayScore: 2, homePens: 3, awayPens: 4 })).toBe("away");
  });

  it("names nobody for a level game with no shootout, or a level shootout", () => {
    expect(winner({ homeScore: 2, awayScore: 2 })).toBeNull();
    expect(winner({ homeScore: 2, awayScore: 2, homePens: 4, awayPens: 4 })).toBeNull();
    expect(winner({ homeScore: null, awayScore: null })).toBeNull();
  });
});
