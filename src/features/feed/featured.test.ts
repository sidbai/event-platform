import { describe, expect, it } from "vitest";

import { justFinished, pickFeatured, SOON_DAYS } from "./featured";

const NOW = new Date("2026-09-08T12:00:00Z");
const at = (days: number) => new Date(NOW.getTime() + days * 86_400_000);

const ev = (id: string, startDays: number, endDays = startDays) => ({
  id,
  startsAt: at(startDays),
  endsAt: at(endDays),
});

describe("pickFeatured", () => {
  it("shows what is on now, and leaves the far calendar to /events", () => {
    const out = pickFeatured(
      [ev("january", 120), ev("saturday", 3), ev("running", -1, 1)],
      NOW,
    );
    expect(out.mode).toBe("now");
    expect(out.events.map((e) => e.id)).toEqual(["running", "saturday"]);
  });

  it("puts the latest kick-off first among the ongoing ones", () => {
    // A league running August to March is ongoing for seven months. The
    // tournament that started this morning is what is happening today.
    const out = pickFeatured(
      [ev("season", -38, 180), ev("this-morning", -0.5, 2)],
      NOW,
    );
    expect(out.events.map((e) => e.id)).toEqual(["this-morning", "season"]);
  });

  it("draws the line at three weeks", () => {
    const inside = pickFeatured([ev("just-inside", SOON_DAYS - 1)], NOW);
    expect(inside.mode).toBe("now");

    const outside = pickFeatured([ev("just-outside", SOON_DAYS + 1)], NOW);
    expect(outside.mode).toBe("later");
  });

  it("stops at the limit", () => {
    const many = [1, 2, 3, 4, 5, 6].map((n) => ev(`e${n}`, n));
    expect(pickFeatured(many, NOW).events).toHaveLength(4);
    expect(pickFeatured(many, NOW, 2).events.map((e) => e.id)).toEqual(["e1", "e2"]);
  });

  it("shows what just finished when nothing is on", () => {
    const out = pickFeatured([ev("last-weekend", -3, -2), ev("in-june", -90, -88)], NOW);
    expect(out.mode).toBe("recent");
    // Most recent first, which is the one people are still looking up.
    expect(out.events.map((e) => e.id)).toEqual(["last-weekend", "in-june"]);
  });

  it("prefers a result from last weekend over a tournament in January", () => {
    // The one the old rule got wrong: a band four months ahead of everybody.
    const out = pickFeatured([ev("last-weekend", -3, -2), ev("january", 120)], NOW);
    expect(out.mode).toBe("recent");
    expect(out.events.map((e) => e.id)).toEqual(["last-weekend"]);
  });

  it("falls back to the far calendar only when there is nothing else at all", () => {
    const out = pickFeatured([ev("january", 120)], NOW);
    expect(out.mode).toBe("later");
    expect(out.events.map((e) => e.id)).toEqual(["january"]);
  });

  it("keeps a dateless event on the band rather than losing it", () => {
    // Somebody has posted a game with no date yet; the front page is where
    // they would look for it.
    const out = pickFeatured([{ id: "tbd", startsAt: null, endsAt: null }], NOW);
    expect(out.mode).toBe("now");
    expect(out.events.map((e) => e.id)).toEqual(["tbd"]);
  });

  it("says nothing when there is nothing", () => {
    expect(pickFeatured([], NOW)).toEqual({ events: [], mode: "later" });
  });
});

/**
 * A league does not push the weekend off the front page.
 *
 * These used to appear in the band only when nothing was being played, which
 * held while every event was a weekend. The ECNL season runs to next May, so
 * from the day it was listed the page had something on every day and four
 * tournaments people had just played in dropped off it.
 */
describe("justFinished", () => {
  const now = new Date("2026-09-09T12:00:00Z");
  const ev = (id: string, from: string, to: string) => ({
    id,
    startsAt: new Date(`${from}T16:00:00Z`),
    endsAt: new Date(`${to}T23:00:00Z`),
  });

  it("keeps a fortnight of results, and stops there", () => {
    const out = justFinished(
      [
        ev("labor-day", "2026-09-04", "2026-09-07"),
        ev("zipfizz", "2026-08-14", "2026-08-16"),
        ev("june", "2026-06-26", "2026-06-28"),
      ],
      now,
    );
    expect(out.map((e) => e.id)).toEqual(["labor-day"]);
  });

  it("leads with what finished last, which is not what started last", () => {
    // King Juan Cup started a day later and finished two days earlier.
    const out = justFinished(
      [
        ev("king-juan", "2026-08-29", "2026-08-29"),
        ev("eastside", "2026-08-28", "2026-08-31"),
      ],
      now,
    );
    expect(out.map((e) => e.id)).toEqual(["eastside", "king-juan"]);
  });

  it("does not count a season that is still being played", () => {
    const out = justFinished([ev("ecnl", "2026-08-30", "2027-05-16")], now);
    expect(out).toEqual([]);
  });

  it("takes no more than the band holds", () => {
    const many = [1, 2, 3, 4, 5, 6].map((n) =>
      ev(`e${n}`, `2026-09-0${n}`, `2026-09-0${n}`),
    );
    expect(justFinished(many, now, 3)).toHaveLength(3);
  });
});
