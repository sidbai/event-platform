import { describe, expect, it } from "vitest";

import { describePeriods, orderTiebreakers, parseRules } from "./rules-input";

const form = (over: Partial<Parameters<typeof parseRules>[0]> = {}) => ({
  gameFormat: "",
  advancement: "",
  roster: "",
  tiebreakers: [] as string[],
  goalCap: "",
  periods: "",
  periodMinutes: "",
  ...over,
});

describe("orderTiebreakers", () => {
  it("puts a jumbled selection back into the order the ranker applies", () => {
    expect(orderTiebreakers(["goals_for", "head_to_head", "goal_difference"])).toEqual([
      "head_to_head",
      "goal_difference",
      "goals_for",
    ]);
  });

  it("drops anything the ranker cannot apply", () => {
    // A rule stored here that rankStandings has no case for is a promise the
    // table silently breaks.
    expect(orderTiebreakers(["coin_toss", "goal_difference", "vibes"])).toEqual([
      "goal_difference",
    ]);
  });

  it("de-duplicates", () => {
    expect(orderTiebreakers(["most_wins", "most_wins"])).toEqual(["most_wins"]);
  });

  it("has nothing to order when nothing was picked", () => {
    expect(orderTiebreakers([])).toEqual([]);
  });
});

describe("parseRules", () => {
  it("keeps only what was filled in", () => {
    expect(parseRules(form())).toEqual({ ok: true, value: { tiebreakers: [] } });
  });

  it("carries the prose fields and the numbers", () => {
    const r = parseRules(
      form({
        gameFormat: "9v9, size 4 ball",
        advancement: "Top two per group",
        roster: "16 max, 9 minimum",
        tiebreakers: ["goal_difference", "head_to_head"],
        goalCap: "6",
        periods: "2",
        periodMinutes: "30",
      }),
    );
    expect(r).toEqual({
      ok: true,
      value: {
        gameFormat: "9v9, size 4 ball",
        advancement: "Top two per group",
        roster: "16 max, 9 minimum",
        tiebreakers: ["head_to_head", "goal_difference"],
        goalCapPerGame: 6,
        periods: 2,
        periodMinutes: 30,
      },
    });
  });

  it("refuses a period count with no length, or a length with no count", () => {
    expect(parseRules(form({ periods: "2" })).ok).toBe(false);
    expect(parseRules(form({ periodMinutes: "30" })).ok).toBe(false);
  });

  it("refuses a goal cap of zero, which would flatten every table", () => {
    expect(parseRules(form({ goalCap: "0" })).ok).toBe(false);
  });

  it("refuses numbers that are not numbers", () => {
    expect(parseRules(form({ goalCap: "six" })).ok).toBe(false);
    expect(parseRules(form({ periods: "2.5", periodMinutes: "30" })).ok).toBe(false);
  });

  it("leaves an unset goal cap out, so standings keep their default", () => {
    const r = parseRules(form({ tiebreakers: ["most_wins"] }));
    expect(r.ok && "goalCapPerGame" in r.value).toBe(false);
  });
});

describe("describePeriods", () => {
  it("says halves for two and quarters for four", () => {
    expect(describePeriods({ tiebreakers: [], periods: 2, periodMinutes: 30 })).toBe(
      "2 × 30 min halves",
    );
    expect(describePeriods({ tiebreakers: [], periods: 4, periodMinutes: 12 })).toBe(
      "4 × 12 min quarters",
    );
  });

  it("has nothing to say when the rule is not set", () => {
    expect(describePeriods({ tiebreakers: [] })).toBeNull();
    expect(describePeriods({ tiebreakers: [], periods: 2 })).toBeNull();
  });
});

describe("the points system", () => {
  const form = {
    gameFormat: "",
    advancement: "",
    roster: "",
    tiebreakers: [],
    goalCap: "",
    periods: "",
    periodMinutes: "",
  };

  it("stores a ten-point tournament as one", () => {
    const r = parseRules({ ...form, pointsSystem: "ten-point" });
    expect(r.ok && r.value.pointsSystem).toBe("ten-point");
  });

  it("stores nothing for the ordinary system", () => {
    /*
     * Absence is what every event written before this field means, and it is
     * read as three points a win. Writing "standard" would leave two ways to
     * say the same thing and invite one of them to drift.
     */
    const r = parseRules({ ...form, pointsSystem: "standard" });
    expect(r.ok && "pointsSystem" in r.value).toBe(false);
    expect(parseRules(form).ok).toBe(true);
  });

  it("ignores a system it cannot compute", () => {
    // The select can only send these two, so anything else arrived by hand.
    const r = parseRules({ ...form, pointsSystem: "twelve-point" });
    expect(r.ok && "pointsSystem" in r.value).toBe(false);
  });
});
