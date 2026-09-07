/**
 * When an event is over, and who gets to say so.
 *
 * "Completed" already meant something here — a Final results tag, a page that
 * opens on the table rather than the fixture list, a listing that stays up
 * because a finished tournament is a destination with results rather than an
 * expired advert. What was missing was any way to set it: only the admin
 * review queue ever wrote a status, so every event stayed "published" forever
 * and the difference was invisible.
 *
 * Pure, because "is this over" is a question about two dates and a clock, and
 * every one of those is wrong at exactly one boundary.
 */

const DAY = 24 * 60 * 60 * 1000;

export type Schedulelike = {
  startsAt: Date | null;
  endsAt: Date | null;
};

/**
 * The moment nothing more can happen at this event.
 *
 * A one-day event with no end time gets the rest of that day, because a
 * tournament that starts at 9am is not over at 9:01.
 */
export function endOf(event: Schedulelike): Date | null {
  if (event.endsAt) return event.endsAt;
  if (!event.startsAt) return null;
  return new Date(event.startsAt.getTime() + DAY);
}

/** Whether the last whistle has gone, as far as the calendar knows. */
export function hasFinished(event: Schedulelike, now: Date): boolean {
  const end = endOf(event);
  return end !== null && now.getTime() > end.getTime();
}

/**
 * Whether an event can be marked completed at all.
 *
 * Only one that is actually running. A draft was never announced, a pending
 * one has not been approved, and a cancelled event did not finish — it did not
 * happen, which is a different thing that the page already says.
 */
export function canMarkCompleted(status: string): boolean {
  return status === "published";
}

/** And back again, for the one marked a week early. */
export function canReopen(status: string): boolean {
  return status === "completed";
}

export type Suggestion =
  | { suggest: false }
  | { suggest: true; daysAgo: number; unplayed: number };

/**
 * Whether the page should offer to mark it completed, unprompted.
 *
 * Nobody comes back to a tournament page on the Tuesday after to change a
 * status. So the page asks, once the calendar says it is over — and it says
 * how many results are still missing, because "mark this finished" is the
 * wrong thing to click while a dozen scores are unentered.
 */
export function completionSuggestion(
  event: Schedulelike & { status: string; fixtures: { homeScore: number | null }[] },
  now: Date,
): Suggestion {
  if (!canMarkCompleted(event.status)) return { suggest: false };
  if (!hasFinished(event, now)) return { suggest: false };

  const end = endOf(event)!;
  return {
    suggest: true,
    daysAgo: Math.floor((now.getTime() - end.getTime()) / DAY),
    unplayed: event.fixtures.filter((f) => f.homeScore === null).length,
  };
}

/** Where an event is in its own life, as a reader would say it. */
export type Lifecycle = "upcoming" | "ongoing" | "completed";

/**
 * Upcoming, ongoing, or completed.
 *
 * Two sources, and they answer different questions. The calendar knows
 * whether the football has been played; the organizer's mark knows whether
 * they have called it done. The mark wins when it is set — a league whose
 * final was rained off can be finished early, and one still handing out
 * trophies on the Monday is not upcoming again just because its end date
 * slipped.
 *
 * Null for a cancelled event, which did not happen rather than finish, and
 * for one with no dates at all — a scrimmage nobody has scheduled is not
 * "upcoming", it is unscheduled.
 */
export function lifecycleOf(
  event: Schedulelike & { status?: string | null },
  now: Date,
): Lifecycle | null {
  if (event.status === "cancelled") return null;
  if (event.status === "completed") return "completed";

  const end = endOf(event);
  if (!event.startsAt || !end) return null;

  if (now.getTime() < event.startsAt.getTime()) return "upcoming";
  if (now.getTime() > end.getTime()) return "completed";
  return "ongoing";
}
