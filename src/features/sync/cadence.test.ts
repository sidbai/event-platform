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
  });

  it("stands aside while somebody else is already fetching it", () => {
    // A caller that claims an event writes a time to look again before going
    // off to fetch. Without this, "never synced" stays true for every reader
    // who opens the page in the meantime and they all fetch it at once.
    expect(isDue({ nextSyncAt: at(0.08), lastSyncedAt: null }, now)).toBe(false);
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

describe("an event somebody has closed", () => {
  const playing = {
    startsAt: new Date("2026-08-21T16:00:00Z"),
    endsAt: new Date("2026-08-24T06:00:00Z"),
  };
  // Mid-tournament, when the cadence is otherwise at its most eager.
  const now = new Date("2026-08-22T18:00:00Z");

  it("is not polled again once marked completed", () => {
    /*
     * The dates stop a poll two days after the last whistle, which is right
     * when nobody has said anything. A person marking it completed has said
     * something better than a date can: the results are final.
     */
    expect(nextSyncAt({ ...playing, status: "completed" }, now)).toBeNull();
  });

  it("is not polled again once cancelled", () => {
    // The same answer for the opposite reason: nothing left to be current
    // about.
    expect(nextSyncAt({ ...playing, status: "cancelled" }, now)).toBeNull();
  });

  it("is still polled hard while it is published and being played", () => {
    // The guard must not quietly stop everything else.
    const next = nextSyncAt({ ...playing, status: "published" }, now);
    expect(next).not.toBeNull();
    expect(next!.getTime() - now.getTime()).toBe(20 * 60_000);
  });

  it("says nothing about status when none is given", () => {
    // Callers that only know the dates keep the behaviour they had.
    expect(nextSyncAt(playing, now)).not.toBeNull();
  });
});

/**
 * A season is not a long weekend.
 *
 * The rule above treats "has it started" as "is it being played", which is
 * true of a tournament and false of a league from August to March. Twenty
 * minutes across seven months is about fifteen thousand requests to answer a
 * question that changes on thirty Saturdays.
 */
describe("nextSyncAt for a season", () => {
  // Started six weeks ago, runs another five months.
  const league = { startsAt: at(-24 * 42), endsAt: at(24 * 150) };

  it("asks once a day between rounds", () => {
    expect(
      minutesUntil(nextSyncAt({ ...league, kickoffs: [at(24 * 4)] }, now)),
    ).toBe(1440);
  });

  it("asks every twenty minutes while games are on", () => {
    expect(minutesUntil(nextSyncAt({ ...league, kickoffs: [at(1)] }, now))).toBe(20);
    // And just after, when the last results are landing.
    expect(minutesUntil(nextSyncAt({ ...league, kickoffs: [at(-3)] }, now))).toBe(20);
  });

  it("asks every couple of hours on the day either side", () => {
    expect(minutesUntil(nextSyncAt({ ...league, kickoffs: [at(20)] }, now))).toBe(120);
    expect(minutesUntil(nextSyncAt({ ...league, kickoffs: [at(-20)] }, now))).toBe(120);
  });

  it("takes the nearest kickoff, not the first in the list", () => {
    // A season's fixtures arrive in whatever order the platform published
    // them, and most of them are months away.
    const kickoffs = [at(24 * 60), at(2), at(-24 * 30)];
    expect(minutesUntil(nextSyncAt({ ...league, kickoffs }, now))).toBe(20);
  });

  it("asks daily when the fixtures have not been published yet", () => {
    // A league listed before its schedule exists. Something will change, but
    // not in the next hour.
    expect(minutesUntil(nextSyncAt({ ...league, kickoffs: [] }, now))).toBe(1440);
    expect(minutesUntil(nextSyncAt(league, now))).toBe(1440);
  });

  it("does not outlive the season by more than the settling days", () => {
    // Ends tomorrow, no fixtures left. A daily poll must not be scheduled
    // past the point the rule above would have stopped asking altogether.
    const ending = { startsAt: at(-24 * 60), endsAt: at(12) };
    const next = nextSyncAt({ ...ending, kickoffs: [] }, now)!;
    expect(next.getTime()).toBeLessThanOrEqual(at(12 + 48).getTime());
  });

  it("leaves a weekend tournament exactly as it was", () => {
    // Started this morning, ends tomorrow: the twenty minutes are still
    // right, and the kickoffs are not consulted at all.
    const weekend = { startsAt: at(-2), endsAt: at(24) };
    expect(minutesUntil(nextSyncAt(weekend, now))).toBe(20);
    expect(minutesUntil(nextSyncAt({ ...weekend, kickoffs: [at(24 * 5)] }, now))).toBe(20);
  });
});
