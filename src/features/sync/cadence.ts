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
};

/**
 * When to look again, or null to stop.
 *
 * Stopping matters as much as the rest. A finished tournament's schedule
 * never changes again, and a connector that keeps polling it forever turns a
 * fixed cost into one that grows with every event ever listed.
 */
export function nextSyncAt(event: Syncable, now: Date): Date | null {
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

  // Being played. Kick-off times move between fields and scores land every
  // few minutes; this is the only window where minutes matter.
  if (t >= start) return new Date(t + 20 * MINUTE);

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
