/**
 * How often to ask a platform whether anything has changed.
 *
 * A fixed interval is wrong in both directions at once: hourly is far too
 * often for a tournament in January and far too rare on the Saturday it is
 * being played, when kick-off times move between fields and scores land every
 * few minutes.
 *
 * So the cadence follows the event. Pure and taking `now`, because "how often
 * should this be checked" is a rule worth being able to read, and because
 * every branch is a boundary that is easy to get quietly wrong.
 */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export type Syncable = {
  startsAt: Date | null;
  endsAt: Date | null;
  /** The event's own status. 'completed' and 'cancelled' end the polling. */
  status?: string;
  /**
   * When this event's games actually kick off.
   *
   * Only consulted for an event that runs longer than a weekend, where
   * "started" and "being played" stop meaning the same thing. A tournament is
   * being played for the whole of its span; a league that runs August to
   * March is being played on about thirty Saturdays out of two hundred days.
   */
  kickoffs?: (Date | null)[];
  /** The event's own zone, so "Monday morning" means its Monday. */
  timezone?: string | null;
};

/**
 * Longer than this and the span is a season rather than an occasion.
 *
 * Ten days: no weekend tournament reaches it, and no league falls under it.
 * The number only decides which of the two rules below applies, so a fortnight
 * -long showcase landing on the season side costs a slower poll, not a wrong
 * one.
 */
const SEASON_DAYS = 10;

/**
 * When to look again, or null to stop.
 *
 * Stopping matters as much as the rest. A finished tournament's schedule
 * never changes again, and a connector that keeps polling it forever turns a
 * fixed cost into one that grows with every event ever listed.
 */
export function nextSyncAt(event: Syncable, now: Date): Date | null {
  /*
   * Somebody said it is over, so stop asking.
   *
   * The dates below stop a poll two days after the last whistle, which is
   * right when nobody has said anything — but a person marking an event
   * completed has said something better than a date can: the results are
   * final. A cancelled event is the same answer for the opposite reason,
   * since there is nothing left to be current about.
   *
   * This is a stronger signal than the calendar and comes first. "Refresh
   * now" on the admin screen still works, and is the way back if a platform
   * publishes a correction afterwards.
   */
  if (event.status === "completed" || event.status === "cancelled") return null;

  const start = event.startsAt?.getTime() ?? null;
  // No date is not a reason to poll forever; there is nothing to be current
  // about until somebody says when it is.
  if (start === null) return null;

  const end = event.endsAt?.getTime() ?? start + DAY;
  const t = now.getTime();

  // Over, and settled. Scores are sometimes corrected for a day or two after
  // the final whistle, so the polling outlives the football by a little.
  if (t > end + 2 * DAY) return null;
  if (t > end) return new Date(t + 2 * HOUR);

  /*
   * Being played — for a weekend, which is what this rule was written for.
   *
   * A league breaks it. "Started" is true for seven months, and twenty-minute
   * polling across all of them is about fifteen thousand requests to answer a
   * question that changes on thirty Saturdays. So a season is asked a
   * different question: not "has it started" but "is there football today".
   */
  if (t >= start) {
    if (end - start > SEASON_DAYS * DAY) return seasonCadence(event, now, end);
    // Kick-off times move between fields and scores land every few minutes;
    // this is the only window where minutes matter.
    return new Date(t + 20 * MINUTE);
  }

  const until = start - t;
  // The day before, and the morning of: the schedule is being finalised.
  if (until <= DAY) return new Date(t + HOUR);
  // The week before: brackets and times are being set.
  if (until <= 7 * DAY) return new Date(t + 6 * HOUR);
  // Further out, nothing changes that a parent needs within a day.
  return new Date(t + DAY);
}

/**
 * Whether a sync is due.
 *
 * A never-synced event is due immediately — that is the import, and waiting a
 * day to show a schedule somebody just asked for would be absurd. Unless it
 * carries a time to look again: a caller that has claimed it writes one there
 * before going off to fetch, so a schedule being read right now is not also
 * due to be read by everybody else who opened the page.
 */
export function isDue(
  event: { nextSyncAt: Date | null; lastSyncedAt: Date | null },
  now: Date,
): boolean {
  if (event.nextSyncAt !== null) return event.nextSyncAt <= now;
  return event.lastSyncedAt === null;
}

/**
 * How stale a schedule is allowed to look before the page stops claiming it.
 *
 * Past this, a page should say it could not refresh rather than present what
 * it has as current. The number is deliberately generous — a few hours of
 * lag is invisible to a parent checking on Thursday — and deliberately finite,
 * because a schedule nobody can refresh is exactly the wrong thing to show
 * with confidence on a Saturday morning.
 */
export function isStale(
  event: { lastSyncedAt: Date | null } & Syncable,
  now: Date,
): boolean {
  if (!event.lastSyncedAt) return true;
  const start = event.startsAt?.getTime() ?? null;
  const end = event.endsAt?.getTime() ?? start;
  const playing = start !== null && end !== null && now.getTime() >= start && now.getTime() <= end;
  const limit = playing ? 2 * HOUR : 2 * DAY;
  return now.getTime() - event.lastSyncedAt.getTime() > limit;
}

/** When one of those reads happens, in the event's own zone. */
const WEEKLY_HOUR = 8;

/**
 * The mornings a season is read on: Monday and Thursday.
 *
 * This was keyed on the nearest kickoff, polling every twenty minutes while
 * games were on. That rule is right for a tournament, where somebody is
 * standing on the touchline refreshing — and wrong for a league, where the
 * question is "what happened at the weekend" and the answer does not change
 * again until the next one.
 *
 * Monday is the one that matters: results are entered on the Sunday evening
 * and corrected on the Monday, so that is when a weekend settles. Thursday is
 * the other half of the week — kick-off times and grounds for the coming
 * weekend are set midweek, and a parent asking on a Friday should not be
 * reading Monday's answer.
 *
 * Named days rather than every third or fourth, because the day is the point.
 * A poll that drifted would read a settled week late every time, and reading
 * a league is fifty-two pages against somebody else's server — which is the
 * other reason this is two mornings and not seven.
 *
 * Refreshing by hand is still there, and covers the exception: a postponement,
 * a midweek cup date, or simply wanting to see it now.
 */
const SEASON_DAYS_OF_WEEK = [1, 4];

function seasonCadence(event: Syncable, now: Date, end: number): Date {
  const zone = event.timezone ?? "America/Los_Angeles";
  const next = Math.min(
    ...SEASON_DAYS_OF_WEEK.map((day) =>
      nextWeekday(now, day, WEEKLY_HOUR, zone).getTime(),
    ),
  );
  // Never past the point where polling stops anyway.
  return new Date(Math.min(next, end + 2 * DAY));
}

/**
 * The next `weekday` at `hour`, read in `timeZone`.
 *
 * Built by asking Intl what the parts of `now` are in that zone rather than
 * by arithmetic on a UTC timestamp: the offset changes twice a year, and a
 * "Monday 08:00" computed as a fixed number of hours from UTC is Monday 07:00
 * for half of the season. Off by an hour is not important here; being wrong
 * in a way nobody would think to look for is.
 */
export function nextWeekday(
  now: Date,
  weekday: number,
  hour: number,
  timeZone: string,
): Date {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const dayName = parts.find((p) => p.type === "weekday")?.value ?? "Mon";
  const localHour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const today = Math.max(0, days.indexOf(dayName));

  let ahead = (weekday - today + 7) % 7;
  // Already past the hour on the day itself, so it is next week's.
  if (ahead === 0 && localHour >= hour) ahead = 7;

  /*
   * Anchored on local midnight of the target day, found by stepping whole
   * days from now and then correcting to the hour the zone actually reads.
   * Cheaper than a date library and exact enough for a weekly poll.
   */
  const target = new Date(now.getTime() + ahead * DAY);
  const at = Number(
    new Intl.DateTimeFormat("en-US", { timeZone, hour: "2-digit", hourCycle: "h23" })
      .format(target),
  );
  return new Date(target.getTime() + (hour - at) * HOUR);
}
