import { describe, expect, it } from "vitest";

import { endDateHint, formatEventWhen, isMultiDay } from "./when";

const SEATTLE = "America/Los_Angeles";
const at = (iso: string) => new Date(iso);

describe("formatEventWhen", () => {
  it("says so when there is no date", () => {
    expect(formatEventWhen(null, null, SEATTLE)).toBe("Date TBD");
  });

  it("names the weekday for a single day", () => {
    expect(formatEventWhen(at("2026-08-29T16:00:00Z"), null, SEATTLE)).toBe(
      "Saturday, August 29, 2026",
    );
  });

  it("keeps a tournament weekend inside one month on one month", () => {
    expect(
      formatEventWhen(at("2026-08-29T16:00:00Z"), at("2026-08-31T23:00:00Z"), SEATTLE),
    ).toBe("August 29–31, 2026");
  });

  it("names both months when a weekend crosses one", () => {
    expect(
      formatEventWhen(at("2026-08-29T16:00:00Z"), at("2026-09-02T23:00:00Z"), SEATTLE),
    ).toBe("August 29 – September 2, 2026");
  });

  it("names both years for a season that crosses New Year", () => {
    // The case that matters most: a fall-to-spring league printed with one
    // year reads as a typo.
    expect(
      formatEventWhen(at("2026-09-12T16:00:00Z"), at("2027-03-14T23:00:00Z"), SEATTLE),
    ).toBe("September 12, 2026 – March 14, 2027");
  });

  it("reads the range in the event's timezone, not the server's", () => {
    // 03:00 UTC on the 30th is still 8pm on the 29th in Seattle, so this is
    // one day there and two in UTC.
    const start = at("2026-08-29T16:00:00Z");
    const end = at("2026-08-30T03:00:00Z");
    expect(formatEventWhen(start, end, SEATTLE)).toBe("Saturday, August 29, 2026");
    expect(formatEventWhen(start, end, "UTC")).toBe("August 29–30, 2026");
  });

  it("falls back to the single date when the end is not after the start", () => {
    const start = at("2026-08-29T16:00:00Z");
    expect(formatEventWhen(start, start, SEATTLE)).toBe("Saturday, August 29, 2026");
    expect(formatEventWhen(start, at("2026-08-01T00:00:00Z"), SEATTLE)).toBe(
      "Saturday, August 29, 2026",
    );
  });

  it("abbreviates for a list, and still says the year once", () => {
    expect(
      formatEventWhen(at("2026-08-29T16:00:00Z"), null, SEATTLE, "short"),
    ).toBe("Aug 29, 2026");
    expect(
      formatEventWhen(
        at("2026-08-29T16:00:00Z"),
        at("2026-08-31T23:00:00Z"),
        SEATTLE,
        "short",
      ),
    ).toBe("Aug 29–31, 2026");
  });

  it("uses an en dash rather than a hyphen", () => {
    const s = formatEventWhen(
      at("2026-08-29T16:00:00Z"),
      at("2026-08-31T23:00:00Z"),
      SEATTLE,
    );
    expect(s).toContain("–");
    expect(s).not.toContain("-");
  });
});

describe("isMultiDay", () => {
  it("is false without both ends", () => {
    expect(isMultiDay(at("2026-08-29T16:00:00Z"), null, SEATTLE)).toBe(false);
    expect(isMultiDay(null, at("2026-08-31T16:00:00Z"), SEATTLE)).toBe(false);
  });

  it("is false for a long day and true for a short two days", () => {
    // 9am to 11pm the same day is not multi-day; 11pm to 1am is.
    expect(
      isMultiDay(at("2026-08-29T16:00:00Z"), at("2026-08-30T06:00:00Z"), SEATTLE),
    ).toBe(false);
    expect(
      isMultiDay(at("2026-08-30T06:30:00Z"), at("2026-08-30T08:30:00Z"), SEATTLE),
    ).toBe(true);
  });
});

describe("endDateHint", () => {
  it("says what the field is for, by kind", () => {
    expect(endDateHint("tournament")).toMatch(/tournament/);
    expect(endDateHint("league")).toMatch(/season/);
    expect(endDateHint("pickup")).toMatch(/more than one day/);
  });
});
