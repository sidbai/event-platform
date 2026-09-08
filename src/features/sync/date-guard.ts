/**
 * Whether a pasted schedule belongs to the event it is being pasted into.
 *
 * The paste box takes whatever is on somebody's clipboard and writes it to
 * whichever event's form they scrolled to, and those two are not checked
 * against each other by anything else: a Labor Day schedule went into a June
 * tournament here, 421 fixtures landed without a murmur, and the only thing
 * that noticed was a parent seeing the same game listed under two events.
 *
 * Dates are the check, because they are the one fact a schedule carries that
 * the event also knows. Team names are shared across a season's tournaments
 * and division names are shared across platforms, but a tournament that runs
 * in June does not play fixtures in September.
 *
 * Deliberately narrow. Only a schedule dated *entirely* outside the event's
 * own days is refused — one stray row, a paste that spans a rain date, or a
 * schedule with no date headings at all goes through as before. Being wrong
 * here costs an admin a tick-box; being silent costs a day of repair work.
 */

/** An event's own days. Both are nullable in the table, and often null. */
export type EventWindow = { startsAt: Date | null; endsAt: Date | null };

export type DateMismatch = {
  /** The pasted schedule's own range, YYYY-MM-DD. */
  from: string;
  to: string;
  /** The event's range, same shape. */
  eventFrom: string;
  eventTo: string;
  /** Whole days between the two ranges at their closest. */
  days: number;
};

const DAY = 86_400_000;

/**
 * A week's slack on each side.
 *
 * Listings carry approximate dates — an end date is often missing entirely,
 * and a tournament sometimes plays a flight the weekend before. A week keeps
 * all of that working and still catches what actually went wrong, which was
 * off by twelve.
 */
const GRACE_DAYS = 7;

const dayOf = (iso: string) => Date.parse(`${iso}T00:00:00Z`) / DAY;

const isoOf = (at: Date) => at.toISOString().slice(0, 10);

/**
 * The mismatch, or null when there is nothing to say.
 *
 * Null covers "this looks right" and "there is no way to tell" alike: an
 * event with no dates of its own, or a paste whose rows carry none, cannot
 * be checked, and refusing what we cannot check would only teach people to
 * tick the box every time.
 */
export function datesLookWrong(
  dates: (string | null)[],
  event: EventWindow,
  graceDays: number = GRACE_DAYS,
): DateMismatch | null {
  const known = dates.filter((d): d is string => Boolean(d)).sort();
  if (known.length === 0) return null;
  if (!event.startsAt) return null;

  const from = known[0];
  const to = known[known.length - 1];
  // An event with no end date is a one-day event as far as this can tell,
  // and the grace above is what covers a three-day one that never said so.
  const eventFrom = isoOf(event.startsAt);
  const eventEnd =
    event.endsAt && event.endsAt >= event.startsAt ? event.endsAt : event.startsAt;
  const eventTo = isoOf(eventEnd);

  const before = dayOf(eventFrom) - dayOf(to);
  const after = dayOf(from) - dayOf(eventTo);
  const days = Math.max(before, after);
  if (days <= graceDays) return null;

  return { from, to, eventFrom, eventTo, days };
}

/** What to tell the admin who just pasted it. */
export function mismatchMessage(m: DateMismatch): string {
  const range = (a: string, b: string) => (a === b ? a : `${a} to ${b}`);
  return (
    `Those fixtures are dated ${range(m.from, m.to)}, and this event runs ` +
    `${range(m.eventFrom, m.eventTo)} — ${m.days} days apart. ` +
    `That is usually the wrong event. Tick “import anyway” if it really is this one.`
  );
}
