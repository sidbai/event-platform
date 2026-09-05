import { describe, expect, it } from "vitest";

import { formatEventDate, postedSeparately } from "./dates";

describe("formatEventDate", () => {
  it("shows the day that was typed", () => {
    expect(formatEventDate("2026-08-29")).toBe("August 29, 2026");
  });

  it("does not slip a day west of UTC", () => {
    // The whole point: this site is read in Seattle. Formatting midnight UTC
    // in local time would render the King Juan Cup as the 28th.
    const seattle = process.env.TZ;
    process.env.TZ = "America/Los_Angeles";
    try {
      expect(formatEventDate("2026-08-29")).toBe("August 29, 2026");
      expect(formatEventDate("2026-01-01")).toBe("January 1, 2026");
    } finally {
      process.env.TZ = seattle;
    }
  });

  it("abbreviates when asked, for a dense list", () => {
    expect(formatEventDate("2026-08-29", { month: "short" })).toBe("Aug 29, 2026");
  });

  it("has nothing to show for a post with no such day", () => {
    expect(formatEventDate(null)).toBeNull();
    expect(formatEventDate("")).toBeNull();
  });
});

describe("postedSeparately", () => {
  it("is worth saying when the recap came later", () => {
    expect(postedSeparately("2026-08-29", new Date("2026-09-05T12:00:00Z"))).toBe(
      true,
    );
  });

  it("is noise when it went up the same day", () => {
    expect(postedSeparately("2026-08-29", new Date("2026-08-29T23:00:00Z"))).toBe(
      false,
    );
  });

  it("has nothing to compare without both dates", () => {
    expect(postedSeparately(null, new Date())).toBe(false);
    expect(postedSeparately("2026-08-29", null)).toBe(false);
  });
});
