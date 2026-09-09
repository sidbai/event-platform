import { describe, expect, it } from "vitest";

import { checkResult, sameCompetition } from "./add-result";

const NOW = new Date("2026-09-09T12:00:00Z");
const good = {
  playedOn: "2026-07-12",
  opponent: "FC Dallas B12 Red",
  ourScore: "3",
  theirScore: "1",
  competition: "Dallas Cup",
};

describe("checkResult", () => {
  it("takes the four things a parent actually knows", () => {
    const checked = checkResult(good, NOW);
    expect(checked.ok).toBe(true);
    if (!checked.ok) return;
    expect(checked.value).toMatchObject({
      opponent: "FC Dallas B12 Red",
      ourScore: 3,
      theirScore: 1,
      competition: "Dallas Cup",
      wasHome: false,
    });
  });

  it("puts the game at midday, so the day survives the reader's timezone", () => {
    // Stored at midnight it lands on the previous day for every reader west
    // of Greenwich, which is all of them.
    const checked = checkResult(good, NOW);
    if (!checked.ok) throw new Error("expected ok");
    expect(checked.value.playedOn.toISOString()).toBe("2026-07-12T12:00:00.000Z");
  });

  it("has no competition when it was not a cup", () => {
    const checked = checkResult({ ...good, competition: "  " }, NOW);
    if (!checked.ok) throw new Error("expected ok");
    expect(checked.value.competition).toBeNull();
  });

  it("refuses a date that has not happened", () => {
    // A result, not a fixture — and a future date is a mistyped year far more
    // often than it is somebody filing next week's game early.
    const checked = checkResult({ ...good, playedOn: "2027-07-12" }, NOW);
    expect(checked).toEqual({ ok: false, error: "That date has not happened yet." });
  });

  it("asks for the date in one shape", () => {
    expect(checkResult({ ...good, playedOn: "July 12" }, NOW)).toMatchObject({ ok: false });
    expect(checkResult({ ...good, playedOn: "" }, NOW)).toMatchObject({ ok: false });
  });

  it("needs an opponent worth the name", () => {
    expect(checkResult({ ...good, opponent: " " }, NOW)).toEqual({
      ok: false,
      error: "Who did you play?",
    });
    expect(checkResult({ ...good, opponent: "x".repeat(81) }, NOW)).toMatchObject({
      ok: false,
    });
  });

  it("takes nil-nil, and refuses anything that is not a whole number", () => {
    expect(checkResult({ ...good, ourScore: "0", theirScore: "0" }, NOW)).toMatchObject({
      ok: true,
    });
    for (const bad of ["", "-1", "2.5", "two", "100"]) {
      expect(checkResult({ ...good, ourScore: bad }, NOW)).toMatchObject({ ok: false });
    }
  });

  it("tidies the whitespace a form leaves behind", () => {
    const checked = checkResult({ ...good, opponent: "  FC   Dallas  " }, NOW);
    if (!checked.ok) throw new Error("expected ok");
    expect(checked.value.opponent).toBe("FC Dallas");
  });
});

describe("sameCompetition", () => {
  it("finds one cup written two ways", () => {
    expect(sameCompetition("Surf Cup", "surf cup")).toBe(true);
    expect(sameCompetition("Surf Cup", "SurfCup")).toBe(true);
  });

  it("leaves two names that are not obviously the same alone", () => {
    // Merging two real tournaments on a guess is worse than carrying two
    // records until somebody says they are the same.
    expect(sameCompetition("Surf Cup", "Surf Cup San Diego")).toBe(false);
    expect(sameCompetition("", "")).toBe(false);
  });
});
