import { describe, expect, it } from "vitest";

import { PER_PAGE, pageHref, paginate, parsePage } from "./paginate";

describe("parsePage", () => {
  it("reads a page number", () => {
    expect(parsePage("3")).toBe(3);
  });

  it("falls back to 1 on anything unusable", () => {
    for (const bad of [undefined, "", "0", "-2", "abc", "1.5", "NaN"]) {
      expect(parsePage(bad)).toBe(1);
    }
  });

  it("caps absurd values so OFFSET stays sane", () => {
    expect(parsePage("999999999")).toBe(10_000);
  });
});

describe("paginate", () => {
  it("describes the first page", () => {
    const p = paginate(167, 1);
    expect(p).toMatchObject({ page: 1, offset: 0, from: 1, to: 24, hasPrev: false, hasNext: true });
    expect(p.totalPages).toBe(Math.ceil(167 / PER_PAGE));
  });

  it("describes a middle page", () => {
    const p = paginate(167, 3);
    expect(p).toMatchObject({ offset: 48, from: 49, to: 72, hasPrev: true, hasNext: true });
  });

  it("describes the last page, which is short", () => {
    const p = paginate(167, 7);
    expect(p).toMatchObject({ page: 7, to: 167, hasNext: false });
    expect(p.to - p.from + 1).toBe(167 - 6 * 24);
  });

  it("clamps a page past the end onto the last page", () => {
    // Better a real page than an empty screen someone thinks is a bug.
    expect(paginate(167, 99).page).toBe(7);
  });

  it("handles an empty list without dividing by zero", () => {
    expect(paginate(0, 1)).toMatchObject({
      page: 1, totalPages: 1, from: 0, to: 0, hasPrev: false, hasNext: false,
    });
  });

  it("does not paginate a list that fits", () => {
    const p = paginate(24, 1);
    expect(p.totalPages).toBe(1);
    expect(p.hasNext).toBe(false);
  });

  it("needs a second page for one row over", () => {
    expect(paginate(25, 1).hasNext).toBe(true);
  });
});

describe("pageHref", () => {
  it("omits page=1 so the first page has one canonical URL", () => {
    expect(pageHref("/coaches", {}, 1)).toBe("/coaches");
  });

  it("keeps the search you are paging within", () => {
    // Dropping q here would silently page through everything instead.
    expect(pageHref("/coaches", { q: "kettle" }, 2)).toBe("/coaches?q=kettle&page=2");
  });

  it("drops empty params rather than trailing ?q=", () => {
    expect(pageHref("/community", { c: undefined, q: "" }, 3)).toBe("/community?page=3");
  });

  it("escapes values", () => {
    expect(pageHref("/clubs", { q: "port orchard" }, 2)).toBe(
      "/clubs?q=port+orchard&page=2",
    );
  });
});
