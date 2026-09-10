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
  // Started six weeks ago, runs another five months. `now` is a Sunday.
  const league = { startsAt: at(-24 * 42), endsAt: at(24 * 150) };
  const PT = "America/Los_Angeles";
  /** What the event's own zone says the moment is. */
  const local = (d: Date) =>
    new Intl.DateTimeFormat("en-US", {
      timeZone: PT,
      weekday: "short",
      hour: "2-digit",
      hourCycle: "h23",
    }).format(d);

  it("asks on the Monday morning after the weekend", () => {
    /*
     * Monday is the one that matters: results are entered on the Sunday
     * evening and corrected on the Monday, so that is when a weekend settles.
     * Named days rather than every third, because the day is the point.
     */
    expect(local(nextSyncAt({ ...league, timezone: PT }, now)!)).toBe("Mon, 08");
  });

  it("and again on the Thursday, for the week the weekend has not settled", () => {
    /*
     * Kick-off times and grounds for the coming weekend are set midweek. A
     * parent asking on a Friday should not be reading Monday's answer.
     */
    const monday = new Date("2026-09-07T18:00:00Z"); // 11am Pacific, Monday
    const next = nextSyncAt({ ...league, timezone: PT }, monday)!;
    expect(local(next)).toBe("Thu, 08");
    // This week's Thursday, not next week's.
    expect(next.getTime()).toBeLessThan(monday.getTime() + 4 * 24 * 3_600_000);
  });

  it("comes back round to Monday after the Thursday", () => {
    const thursday = new Date("2026-09-10T18:00:00Z"); // 11am Pacific, Thursday
    expect(local(nextSyncAt({ ...league, timezone: PT }, thursday)!)).toBe("Mon, 08");
  });

  it("reads a league twice a week and no more", () => {
    /*
     * Fifty-two pages against somebody else's server is the other half of why
     * this is two mornings. Walking a season forward, every gap is three or
     * four days — never a day, and never a week.
     */
    const days: string[] = [];
    const at: number[] = [];
    let cursor = new Date("2026-09-06T12:00:00Z");
    for (let i = 0; i < 8; i++) {
      const next = nextSyncAt({ ...league, timezone: PT }, cursor)!;
      days.push(local(next));
      at.push(next.getTime());
      // Three hours after being read, which is where the next one is decided.
      cursor = new Date(next.getTime() + 3 * 3_600_000);
    }
    expect(new Set(days)).toEqual(new Set(["Mon, 08", "Thu, 08"]));

    // Between one read and the next: three days or four, never one or seven.
    const gaps = at.slice(1).map((t, i) => Math.round((t - at[i]) / 3_600_000 / 24));
    expect(Math.min(...gaps)).toBe(3);
    expect(Math.max(...gaps)).toBe(4);
  });

  it("does not care where the kickoffs are", () => {
    // This is the rule that changed. Games being on used to mean twenty
    // minutes; for a league nobody is watching a U13 result land.
    for (const kickoffs of [[at(1)], [at(-3)], [at(20)], [at(24 * 4)], []]) {
      expect(local(nextSyncAt({ ...league, kickoffs, timezone: PT }, now)!)).toBe("Mon, 08");
    }
  });

  it("reads the day in the event's own zone, not the server's", () => {
    /*
     * Computed through Intl rather than by adding hours to a timestamp: the
     * offset moves twice a year, and "Monday 08:00" as a fixed distance from
     * UTC is Monday 07:00 for half of a season.
     */
    expect(local(nextSyncAt({ ...league, timezone: PT }, now)!)).toBe("Mon, 08");
    const tokyo = "Asia/Tokyo";
    const inTokyo = new Intl.DateTimeFormat("en-US", {
      timeZone: tokyo,
      weekday: "short",
      hour: "2-digit",
      hourCycle: "h23",
    }).format(nextSyncAt({ ...league, timezone: tokyo }, now)!);
    expect(inTokyo).toBe("Mon, 08");
  });

  it("is a season before it starts, too", () => {
    /*
     * Every other rule here is written for a weekend — an hour the night
     * before, six hours the week before — and a league breaks them the same
     * way it breaks the twenty-minute one. The Regional Club League sat two
     * days from kick-off being read four times a day, fifty-two pages each
     * time, off a fixture list that had not changed since August.
     */
    const soon = { startsAt: at(48), endsAt: at(24 * 250), kickoffs: [], timezone: PT };
    expect(local(nextSyncAt(soon, now)!)).toMatch(/^(Mon|Thu), 08$/);

    const tomorrow = { startsAt: at(12), endsAt: at(24 * 250), kickoffs: [], timezone: PT };
    expect(local(nextSyncAt(tomorrow, now)!)).toMatch(/^(Mon|Thu), 08$/);
  });

  it("still reads a weekend the way a weekend wants", () => {
    // The rules this moved past are right for the thing they were written
    // for: a tournament the night before its first whistle.
    const cup = { startsAt: at(12), endsAt: at(60), kickoffs: [] };
    const next = nextSyncAt(cup, now)!;
    expect(next.getTime()).toBeLessThanOrEqual(now.getTime() + 3_600_000 + 1000);
  });

  it("does not outlive the season by more than the settling days", () => {
    // Ends tomorrow. A weekly poll must not be scheduled past the point the
    // rule above would have stopped asking altogether.
    const ending = { startsAt: at(-24 * 60), endsAt: at(12), timezone: PT };
    const next = nextSyncAt({ ...ending, kickoffs: [] }, now)!;
    expect(next.getTime()).toBeLessThanOrEqual(at(12 + 48).getTime());
  });

  it("leaves a weekend tournament exactly as it was", () => {
    // Started this morning, ends tomorrow: the twenty minutes are still
    // right, and neither the kickoffs nor the weekday are consulted.
    const weekend = { startsAt: at(-2), endsAt: at(24) };
    expect(minutesUntil(nextSyncAt(weekend, now))).toBe(20);
    expect(minutesUntil(nextSyncAt({ ...weekend, kickoffs: [at(24 * 5)] }, now))).toBe(20);
  });
});

