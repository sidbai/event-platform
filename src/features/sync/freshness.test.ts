import { describe, expect, it } from "vitest";

import { formatAgo, syncNote } from "./freshness";

const now = new Date("2026-09-06T12:00:00Z");
const ago = (ms: number) => new Date(now.getTime() - ms);
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

describe("formatAgo", () => {
  it("reads as somebody would say it out loud", () => {
    expect(formatAgo(ago(20_000), now)).toBe("just now");
    expect(formatAgo(ago(MINUTE), now)).toBe("1 minute ago");
    expect(formatAgo(ago(12 * MINUTE), now)).toBe("12 minutes ago");
    expect(formatAgo(ago(HOUR), now)).toBe("1 hour ago");
    expect(formatAgo(ago(3 * HOUR), now)).toBe("3 hours ago");
    expect(formatAgo(ago(2 * DAY), now)).toBe("2 days ago");
  });

  it("does not print a negative age when a clock runs ahead", () => {
    expect(formatAgo(new Date(now.getTime() + 5 * MINUTE), now)).toBe("just now");
  });
});

describe("syncNote", () => {
  const played = {
    sourcePlatform: "athletes2events",
    sourceName: "Crossfire Premier Soccer",
    startsAt: ago(2 * HOUR),
    endsAt: new Date(now.getTime() + 6 * HOUR),
  };

  it("says nothing about an event we run ourselves", () => {
    // There is no upstream to be behind, so a freshness line would be noise.
    expect(
      syncNote(
        { sourcePlatform: null, sourceName: null, startsAt: null, endsAt: null, lastSyncedAt: null },
        now,
      ),
    ).toBeNull();
  });

  it("names when it last came through, and who from", () => {
    const note = syncNote({ ...played, lastSyncedAt: ago(12 * MINUTE) }, now);
    expect(note).toEqual({
      text: "Updated 12 minutes ago from Crossfire Premier Soccer",
      stale: false,
    });
  });

  it("stops presenting a schedule as current once it has gone quiet", () => {
    // Saturday morning, three hours without a refresh: the fixture list on
    // screen may already be wrong about which field a game moved to.
    const note = syncNote({ ...played, lastSyncedAt: ago(3 * HOUR) }, now);
    expect(note?.stale).toBe(true);
    expect(note?.text).toContain("have not been able to refresh");
  });

  it("is relaxed about an event that is weeks away", () => {
    const upcoming = { ...played, startsAt: new Date(now.getTime() + 20 * DAY), endsAt: null };
    expect(syncNote({ ...upcoming, lastSyncedAt: ago(10 * HOUR) }, now)?.stale).toBe(false);
  });

  it("admits when it has never managed to read it", () => {
    expect(syncNote({ ...played, lastSyncedAt: null }, now)).toEqual({
      text: "Not read from Crossfire Premier Soccer yet",
      stale: true,
    });
  });
});
