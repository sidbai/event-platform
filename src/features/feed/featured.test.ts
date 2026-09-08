import { describe, expect, it } from "vitest";

import { pickFeatured } from "./featured";

const NOW = new Date("2026-09-08T12:00:00Z");
const at = (days: number) => new Date(NOW.getTime() + days * 86_400_000);

const ev = (id: string, startDays: number, endDays = startDays) => ({
  id,
  startsAt: at(startDays),
  endsAt: at(endDays),
});

describe("pickFeatured", () => {
  it("puts what is being played now first, then what is soonest", () => {
    const out = pickFeatured(
      [ev("november", 60), ev("saturday", 3), ev("running", -1, 1)],
      NOW,
    );
    expect(out.mode).toBe("ahead");
    expect(out.events.map((e) => e.id)).toEqual(["running", "saturday", "november"]);
  });

  it("stops at the limit", () => {
    const many = [1, 2, 3, 4, 5, 6].map((n) => ev(`e${n}`, n));
    expect(pickFeatured(many, NOW).events).toHaveLength(4);
    expect(pickFeatured(many, NOW, 2).events.map((e) => e.id)).toEqual(["e1", "e2"]);
  });

  it("shows what just finished when there is nothing ahead", () => {
    const out = pickFeatured([ev("last-weekend", -3, -2), ev("in-june", -90, -88)], NOW);
    expect(out.mode).toBe("recent");
    // Most recent first, which is the one people are still looking up.
    expect(out.events.map((e) => e.id)).toEqual(["last-weekend", "in-june"]);
  });

  it("prefers anything ahead over anything finished", () => {
    const out = pickFeatured([ev("last-weekend", -3, -2), ev("in-november", 60)], NOW);
    expect(out.mode).toBe("ahead");
    expect(out.events.map((e) => e.id)).toEqual(["in-november"]);
  });

  it("keeps a dateless event in the band rather than losing it", () => {
    // Somebody has posted a game with no date yet; the front page is where
    // they would look for it.
    const out = pickFeatured([{ id: "tbd", startsAt: null, endsAt: null }], NOW);
    expect(out.events.map((e) => e.id)).toEqual(["tbd"]);
  });

  it("says nothing when there is nothing", () => {
    expect(pickFeatured([], NOW)).toEqual({ events: [], mode: "recent" });
  });
});
