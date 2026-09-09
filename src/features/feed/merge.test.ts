import { describe, expect, it } from "vitest";

import { dropSupersededPosts, mergeFeed } from "./merge";

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

describe("ordering by what an item is about", () => {
  const day = (iso: string) => new Date(`${iso}T00:00:00Z`);

  it("files a recap under the day it covers, not the day it was typed", () => {
    // The four recaps on the front page were published in one sitting and
    // cover games from July to late August. By publication they came out in
    // no order a reader could see.
    const written = day("2026-09-05");
    const items = [
      { id: "surf", at: written, sortAt: day("2026-08-03") },
      { id: "malaysia", at: written, sortAt: day("2026-08-18") },
      { id: "crossfire", at: written, sortAt: day("2026-07-19") },
      { id: "kjc", at: written, sortAt: day("2026-08-29") },
    ];

    expect(mergeFeed([items], 10).map((i) => i.id)).toEqual([
      "kjc",
      "malaysia",
      "surf",
      "crossfire",
    ]);
  });

  it("falls back to when it was written, for anything that is not about a day", () => {
    // A community post is about the moment somebody posted it.
    const items = [
      { id: "older", at: day("2026-09-01") },
      { id: "newer", at: day("2026-09-04") },
    ];
    expect(mergeFeed([items], 10).map((i) => i.id)).toEqual(["newer", "older"]);
  });

  it("puts a recap and a post on one timeline by those two rules at once", () => {
    const items = [
      // Written today, about a game three weeks ago.
      { id: "recap", at: day("2026-09-09"), sortAt: day("2026-08-18") },
      // Written a week ago, about nothing in particular.
      { id: "post", at: day("2026-09-02") },
    ];
    expect(mergeFeed([items], 10).map((i) => i.id)).toEqual(["post", "recap"]);
  });

  it("treats a null sortAt as absent rather than as the epoch", () => {
    // The column is nullable, and a null read as 1970 would sink every item
    // that has one to the bottom of the page.
    const items = [
      { id: "nulled", at: day("2026-09-08"), sortAt: null },
      { id: "dated", at: day("2026-09-09"), sortAt: day("2026-08-01") },
    ];
    expect(mergeFeed([items], 10).map((i) => i.id)).toEqual(["nulled", "dated"]);
  });
});
