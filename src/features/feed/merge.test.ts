import { describe, expect, it } from "vitest";

import { dropSupersededPosts, mergeFeed, startsWithinFeedWindow } from "./merge";

const at = (iso: string) => new Date(iso);

describe("mergeFeed", () => {
  it("interleaves the sources newest first", () => {
    const news = [
      { id: "n1", at: at("2026-09-03T10:00:00Z") },
      { id: "n2", at: at("2026-08-30T10:00:00Z") },
    ];
    const events = [{ id: "e1", at: at("2026-09-04T10:00:00Z") }];
    const posts = [{ id: "p1", at: at("2026-09-01T10:00:00Z") }];

    expect(mergeFeed([news, events, posts], 10).map((i) => i.id)).toEqual([
      "e1",
      "n1",
      "p1",
      "n2",
    ]);
  });

  it("breaks ties on id, so the same data renders in the same order twice", () => {
    const same = at("2026-09-05T12:00:00Z");
    const a = mergeFeed([[{ id: "b", at: same }], [{ id: "a", at: same }]], 10);
    const b = mergeFeed([[{ id: "a", at: same }], [{ id: "b", at: same }]], 10);
    expect(a.map((i) => i.id)).toEqual(["a", "b"]);
    expect(b.map((i) => i.id)).toEqual(a.map((i) => i.id));
  });

  it("takes the newest across sources, not the newest of each", () => {
    // A quiet week for news must not hold three stale items in the feed while
    // fresher posts wait behind them.
    const news = [
      { id: "n1", at: at("2026-01-01T00:00:00Z") },
      { id: "n2", at: at("2026-01-02T00:00:00Z") },
    ];
    const posts = [
      { id: "p1", at: at("2026-09-01T00:00:00Z") },
      { id: "p2", at: at("2026-09-02T00:00:00Z") },
    ];
    expect(mergeFeed([news, posts], 2).map((i) => i.id)).toEqual(["p2", "p1"]);
  });

  it("is empty when nothing has been posted", () => {
    expect(mergeFeed([[], [], []], 10)).toEqual([]);
  });
});

describe("dropSupersededPosts", () => {
  const post = (id: string, convertedEventId: string | null = null) => ({
    id,
    convertedEventId,
  });

  it("drops the post when its event is in the feed", () => {
    const kept = dropSupersededPosts(
      [post("p1", "e1"), post("p2")],
      new Set(["e1"]),
    );
    expect(kept.map((p) => p.id)).toEqual(["p2"]);
  });

  it("keeps a converted post whose event is not in the feed", () => {
    // The event has already started, or was made private after conversion.
    // Dropping the post too would take the thing off the front page entirely.
    const kept = dropSupersededPosts([post("p1", "e-gone")], new Set(["e1"]));
    expect(kept.map((p) => p.id)).toEqual(["p1"]);
  });

  it("keeps every ordinary post", () => {
    const kept = dropSupersededPosts([post("p1"), post("p2")], new Set(["e1"]));
    expect(kept).toHaveLength(2);
  });
});

describe("startsWithinFeedWindow", () => {
  const now = new Date("2026-09-06T12:00:00Z").getTime();
  const inDays = (n: number) => new Date(now + n * 86_400_000);

  it("keeps what is happening this week", () => {
    for (const d of [0, 1, 3, 6.9]) {
      expect(startsWithinFeedWindow(inDays(d), now)).toBe(true);
    }
  });

  it("leaves a tournament in January to the calendar", () => {
    // Six listings entered in one afternoon all carry today's createdAt, so
    // without this they take the whole front page and push down a scrimmage
    // happening on Saturday.
    expect(startsWithinFeedWindow(inDays(30), now)).toBe(false);
    expect(startsWithinFeedWindow(inDays(120), now)).toBe(false);
  });

  it("keeps a tournament that is still being played", () => {
    // A Thursday-to-Sunday tournament is the most current thing on the site
    // on Sunday, and dropping it off the front page mid-tournament would be
    // exactly backwards.
    expect(startsWithinFeedWindow(inDays(-0.5), now)).toBe(true);
    expect(startsWithinFeedWindow(inDays(-2), now)).toBe(true);
  });

  it("does not let a five-month league sit there for five months", () => {
    // A season that kicked off in September is "upcoming" until March. The
    // lower bound is what stops it pinning the front page for all of it.
    expect(startsWithinFeedWindow(inDays(-20), now)).toBe(false);
  });

  it("treats an undated event as news, not as far off", () => {
    expect(startsWithinFeedWindow(null, now)).toBe(true);
  });

  it("takes a different window when asked", () => {
    expect(startsWithinFeedWindow(inDays(10), now)).toBe(false);
    expect(startsWithinFeedWindow(inDays(10), now, 14)).toBe(true);
  });
});
