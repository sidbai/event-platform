import { describe, expect, it } from "vitest";

import { fieldAnnounced, timeAnnounced } from "./kickoff";

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
