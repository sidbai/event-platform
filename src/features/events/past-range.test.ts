import { describe, expect, it } from "vitest";

import {
  DEFAULT_PAST_RANGE,
  PAST_RANGES,
  pastRangesAreUseful,
  readPastRange,
  withinPastRange,
} from "./past-range";

const NOW = new Date("2026-09-08T12:00:00Z");
const days = (n: number) =>
  new Date(NOW.getTime() - n * 86_400_000);

/** A weekend tournament that finished `n` days ago. */
const finished = (n: number) => ({
  startsAt: days(n + 2),
  endsAt: days(n),
});

describe("readPastRange", () => {
  it("takes what the chips put on the query string", () => {
    expect(readPastRange("1m")).toBe("1m");
    expect(readPastRange("all")).toBe("all");
  });

  it("falls back to the default for anything else", () => {
    expect(readPastRange(undefined)).toBe(DEFAULT_PAST_RANGE);
    expect(readPastRange("")).toBe(DEFAULT_PAST_RANGE);
    expect(readPastRange("last-tuesday")).toBe(DEFAULT_PAST_RANGE);
  });

  it("offers exactly the three the events page shows", () => {
    expect(PAST_RANGES.map((r) => r.label)).toEqual([
      "Last month",
      "Last 3 months",
      "All",
    ]);
  });
});

describe("withinPastRange", () => {
  const archive = [finished(3), finished(45), finished(200)];

  it("narrows to the window", () => {
    expect(withinPastRange(archive, NOW, "1m")).toHaveLength(1);
    expect(withinPastRange(archive, NOW, "3m")).toHaveLength(2);
    expect(withinPastRange(archive, NOW, "all")).toHaveLength(3);
  });

  it("measures from when the event finished, not when it started", () => {
    // A league that ran all spring and ended last week is last week's news.
    const spring = { startsAt: days(150), endsAt: days(6) };
    expect(withinPastRange([spring], NOW, "1m")).toHaveLength(1);
  });

  it("gives a one-day event the rest of its day, as everything else does", () => {
    // Kicked off 30 days and 12 hours ago, so its start is outside a 30-day
    // window and its end — the same clock the Past section used to file it —
    // is not.
    const oneDay = { startsAt: new Date(NOW.getTime() - 30.5 * 86_400_000), endsAt: null };
    expect(withinPastRange([oneDay], NOW, "1m")).toHaveLength(1);
  });

  it("keeps an event it cannot date rather than dropping it silently", () => {
    expect(withinPastRange([{ startsAt: null, endsAt: null }], NOW, "1m")).toHaveLength(1);
  });
});

describe("pastRangesAreUseful", () => {
  it("says no while every past event is recent", () => {
    expect(pastRangesAreUseful([finished(2), finished(9)], NOW)).toBe(false);
    expect(pastRangesAreUseful([], NOW)).toBe(false);
  });

  it("says yes once the narrow window would hide something", () => {
    expect(pastRangesAreUseful([finished(2), finished(60)], NOW)).toBe(true);
  });
});
