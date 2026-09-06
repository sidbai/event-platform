import { describe, expect, it } from "vitest";

import { isDue, isStale, nextSyncAt } from "./cadence";

const now = new Date("2026-09-06T12:00:00Z");
const at = (offsetHours: number) => new Date(now.getTime() + offsetHours * 3_600_000);
const minutesUntil = (d: Date | null) =>
  d === null ? null : Math.round((d.getTime() - now.getTime()) / 60_000);

describe("nextSyncAt", () => {
  it("checks a distant tournament once a day", () => {
    expect(minutesUntil(nextSyncAt({ startsAt: at(24 * 30), endsAt: at(24 * 32) }, now))).toBe(
      1440,
    );
  });

  it("checks every six hours in the week before", () => {
    expect(minutesUntil(nextSyncAt({ startsAt: at(24 * 5), endsAt: at(24 * 6) }, now))).toBe(
      360,
    );
  });

  it("checks hourly the day before, while the schedule is settling", () => {
    expect(minutesUntil(nextSyncAt({ startsAt: at(20), endsAt: at(30) }, now))).toBe(60);
  });

  it("checks every twenty minutes while it is being played", () => {
    // The only window where minutes matter: kick-off times move between
    // fields and scores land continuously.
    expect(minutesUntil(nextSyncAt({ startsAt: at(-2), endsAt: at(6) }, now))).toBe(20);
  });

  it("keeps looking for a couple of days after the final whistle", () => {
    // Scores get corrected after the fact.
    expect(minutesUntil(nextSyncAt({ startsAt: at(-30), endsAt: at(-6) }, now))).toBe(120);
  });

  it("stops once the event is long over", () => {
    // A finished tournament's schedule never changes again. Polling it
    // forever turns a fixed cost into one that grows with every event ever
    // listed.
    expect(nextSyncAt({ startsAt: at(-24 * 10), endsAt: at(-24 * 9) }, now)).toBeNull();
  });

  it("does not poll something with no date at all", () => {
    expect(nextSyncAt({ startsAt: null, endsAt: null }, now)).toBeNull();
  });

  it("treats a one-day event as ending a day after it starts", () => {
    // Being played, so the live cadence applies even with no end date.
    expect(minutesUntil(nextSyncAt({ startsAt: at(-1), endsAt: null }, now))).toBe(20);
  });

  it("never schedules a check in the past", () => {
    for (const offset of [-24 * 5, -24, -2, 0, 2, 24, 24 * 40]) {
      const next = nextSyncAt({ startsAt: at(offset), endsAt: at(offset + 24) }, now);
      if (next) expect(next.getTime()).toBeGreaterThan(now.getTime());
    }
  });
});

describe("isDue", () => {
  it("treats a never-synced event as due immediately", () => {
    // That is the import: waiting a day to show a schedule somebody just
    // asked for would be absurd.
    expect(isDue({ nextSyncAt: null, lastSyncedAt: null }, now)).toBe(true);
    expect(isDue({ nextSyncAt: at(24), lastSyncedAt: null }, now)).toBe(true);
  });

  it("waits until the time it was given", () => {
    expect(isDue({ nextSyncAt: at(1), lastSyncedAt: at(-1) }, now)).toBe(false);
    expect(isDue({ nextSyncAt: at(-1), lastSyncedAt: at(-2) }, now)).toBe(true);
  });

  it("stays quiet once polling has been stopped", () => {
    expect(isDue({ nextSyncAt: null, lastSyncedAt: at(-100) }, now)).toBe(false);
  });
});

describe("isStale", () => {
  const played = { startsAt: at(-2), endsAt: at(6) };
  const upcoming = { startsAt: at(24 * 20), endsAt: at(24 * 21) };

  it("calls a never-synced schedule stale", () => {
    expect(isStale({ ...upcoming, lastSyncedAt: null }, now)).toBe(true);
  });

  it("is strict while the tournament is being played", () => {
    // Two hours out of date on a Saturday morning is a parent at the wrong
    // field.
    expect(isStale({ ...played, lastSyncedAt: at(-1) }, now)).toBe(false);
    expect(isStale({ ...played, lastSyncedAt: at(-3) }, now)).toBe(true);
  });

  it("is relaxed when the event is weeks away", () => {
    // A few hours of lag is invisible to somebody checking on a Thursday.
    expect(isStale({ ...upcoming, lastSyncedAt: at(-10) }, now)).toBe(false);
    expect(isStale({ ...upcoming, lastSyncedAt: at(-24 * 3) }, now)).toBe(true);
  });
});
