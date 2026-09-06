/**
 * What a synced schedule can honestly say about itself.
 *
 * A schedule we copied from somebody else is only as good as the last time we
 * managed to read it, and a page that hides that is worse than one with no
 * schedule at all: a parent trusts a fixture list precisely because it looks
 * authoritative. So every synced page carries a line saying when it last came
 * through, and says so differently once it has gone quiet for too long.
 *
 * Pure, and taking `now`, because "3 hours ago" is the kind of arithmetic that
 * is wrong at exactly one boundary and silently right everywhere else.
 */

import { isStale, type Syncable } from "./cadence";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** "just now", "12 minutes ago", "3 hours ago", "2 days ago". */
export function formatAgo(from: Date, now: Date): string {
  // A clock a little ahead of ours is not a reason to print a negative number.
  const ms = Math.max(0, now.getTime() - from.getTime());
  if (ms < MINUTE) return "just now";
  if (ms < HOUR) return plural(Math.floor(ms / MINUTE), "minute");
  if (ms < DAY) return plural(Math.floor(ms / HOUR), "hour");
  return plural(Math.floor(ms / DAY), "day");
}

function plural(n: number, unit: string): string {
  return `${n} ${unit}${n === 1 ? "" : "s"} ago`;
}

export type SyncNote = {
  text: string;
  /** Too long since we last managed to read it to present this as current. */
  stale: boolean;
};

/**
 * The line a synced page shows about its own freshness, or null when there is
 * nothing to say — an event we run ourselves has no upstream to be behind.
 */
export function syncNote(
  event: Syncable & {
    sourcePlatform: string | null;
    lastSyncedAt: Date | null;
    sourceName: string | null;
  },
  now: Date,
): SyncNote | null {
  if (!event.sourcePlatform) return null;

  const from = event.sourceName ? ` from ${event.sourceName}` : "";
  if (!event.lastSyncedAt) {
    return { text: `Not read${from} yet`, stale: true };
  }

  const ago = formatAgo(event.lastSyncedAt, now);
  const stale = isStale({ ...event, lastSyncedAt: event.lastSyncedAt }, now);
  return {
    text: stale
      ? `Last read${from} ${ago}; we have not been able to refresh it since`
      : `Updated ${ago}${from}`,
    stale,
  };
}
