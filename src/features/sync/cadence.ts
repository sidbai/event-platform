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
/** Close enough to a kickoff that scores are landing. */
const LIVE_WINDOW = 4 * HOUR;

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

/**
 * How often to look at a season that is under way.
 *
 * Keyed on the nearest kickoff rather than on the calendar, because a league
 * postpones a round into midweek and plays a cup date on a Wednesday, and a
 * rule that assumed Saturdays would miss both. With no kickoffs to go on —
 * a league listed before its fixtures are published — daily is the honest
 * answer: something will change, but not in the next hour.
 */
function seasonCadence(event: Syncable, now: Date, end: number): Date {
  const t = now.getTime();
  const kickoffs = (event.kickoffs ?? [])
    .filter((k): k is Date => k !== null)
    .map((k) => k.getTime());
  if (kickoffs.length === 0) return new Date(Math.min(t + DAY, end + 2 * DAY));

  const nearest = kickoffs.reduce(
    (best, k) => (Math.abs(k - t) < Math.abs(best - t) ? k : best),
    kickoffs[0],
  );
  const away = Math.abs(nearest - t);

  // Games are on. This is the window the twenty minutes were always for.
  if (away <= LIVE_WINDOW) return new Date(t + 20 * MINUTE);
  // Later today, or earlier today: the schedule is being finalised, or the
  // last results are landing.
  if (away <= DAY) return new Date(t + 2 * HOUR);
  // Between rounds. Nothing changes that anybody needs within a day.
  return new Date(t + DAY);
}
