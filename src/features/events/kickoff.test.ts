import { describe, expect, it } from "vitest";

import { fieldAnnounced, kickoffLabel, timeAnnounced, whereAnnounced } from "./kickoff";

const PT = "America/Los_Angeles";
/** Midnight Pacific on 26 September 2026, which is 07:00 UTC. */
const midnightPT = new Date("2026-09-26T07:00:00Z");

describe("timeAnnounced", () => {
  it("reads midnight in the event's own zone as no time at all", () => {
    expect(timeAnnounced(midnightPT, PT)).toBe(false);
  });

  it("keeps a time the organizer did give", () => {
    expect(timeAnnounced(new Date("2026-09-26T18:00:00Z"), PT)).toBe(true);
  });

  it("judges it in the event's zone, not the server's", () => {
    // The same instant is 3am in New York and midnight in Los Angeles, and
    // only the second means "no time yet".
    expect(timeAnnounced(midnightPT, "America/New_York")).toBe(true);
    expect(timeAnnounced(midnightPT, PT)).toBe(false);
  });

  it("has nothing to announce without a kick-off", () => {
    expect(timeAnnounced(null, PT)).toBe(false);
    expect(timeAnnounced(undefined, PT)).toBe(false);
  });

  it("does not mistake noon for midnight", () => {
    // 12:00 and 00:00 print the same under a 12-hour clock, which is why
    // this asks for h23 rather than reading "12:00 AM".
    expect(timeAnnounced(new Date("2026-09-26T19:00:00Z"), PT)).toBe(true);
  });
});

describe("fieldAnnounced", () => {
  it("drops the placeholders a platform writes for an unassigned pitch", () => {
    expect(fieldAnnounced("-")).toBeNull();
    expect(fieldAnnounced("—")).toBeNull();
    expect(fieldAnnounced("  ")).toBeNull();
    expect(fieldAnnounced("")).toBeNull();
    expect(fieldAnnounced("TBD")).toBeNull();
    expect(fieldAnnounced(null)).toBeNull();
  });

  it("keeps a real one, trimmed", () => {
    expect(fieldAnnounced(" Field 3 ")).toBe("Field 3");
    expect(fieldAnnounced("Marymoor Park")).toBe("Marymoor Park");
  });
});

describe("whereAnnounced", () => {
  it("puts the ground before the pitch", () => {
    expect(whereAnnounced("Silas High School", "Field 1")).toBe(
      "Silas High School · Field 1",
    );
  });

  it("says only the half it knows", () => {
    expect(whereAnnounced("Lincoln Field", null)).toBe("Lincoln Field");
    expect(whereAnnounced(null, "60A #09")).toBe("60A #09");
    expect(whereAnnounced("TBD", "TBD")).toBeNull();
    expect(whereAnnounced(null, "-")).toBeNull();
  });
});

describe("kickoffLabel", () => {
  const tz = "America/Los_Angeles";

  it("reads as a person would say it", () => {
    expect(kickoffLabel(new Date("2026-09-12T16:00:00Z"), tz)).toBe("Sat, Sep 12, 9:00 AM");
  });

  it("says the time is unknown rather than saying midnight", () => {
    /*
     * A league that has published its season but not its grounds leaves the
     * kick-off at midnight local. "12:00 AM" reads as a fact; it is a gap.
     */
    expect(kickoffLabel(new Date("2026-09-12T07:00:00Z"), tz)).toBe("Sat, Sep 12, time TBD");
  });

  it("has nothing to say without a date", () => {
    expect(kickoffLabel(null, tz)).toBeNull();
    expect(kickoffLabel(undefined, tz)).toBeNull();
  });
});
