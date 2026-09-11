import Link from "next/link";

import type { WeekItem } from "./my-week";
import {
  addDays,
  dayLabel,
  localDate,
  spanLabel,
  timeLabel,
  week,
} from "./week";

/**
 * Seven columns, every event in the column of the day it starts.
 *
 * One word of colour per event for the thing that needs attention. Full is
 * green because it is done; open is plain; a clash is red, because entering
 * Sunday one slot at a time is exactly how the two o'clock gets entered
 * twice, and the person who did it is the last to notice.
 *
 * Server-rendered and made of links. Somebody on a phone between sessions
 * needs to see the week and tap a slot, not drag one.
 */

/**
 * The end somebody chose, or null.
 *
 * A league's end is its last day months away, stored as 23:59; on a week
 * grid that "overlaps" everything and prints as 9:00 am–11:59 pm. Only an
 * end on the same local day, and not at the end of it, is a time a person
 * typed — anything else is drawn an hour long and labelled by its start.
 */
function chosenEnd(e: WeekItem): Date | null {
  if (!e.endsAt || e.endsAt <= e.startsAt) return null;
  if (localDate(e.startsAt) !== localDate(e.endsAt)) return null;
  const clock = new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Los_Angeles",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(e.endsAt);
  return clock === "23:59" ? null : e.endsAt;
}

/**
 * Two things that share a minute — but only when at least one of them has
 * an end somebody chose.
 *
 * Two assumed hours colliding is not a finding: a followed team's 8:43
 * kick-off and a league's "season starts 9:00" marker were flagged against
 * each other, and neither was a slot anybody typed. A coach's 2:00–3:00
 * against their 2:30–3:30 is, and that is the case the mark exists for.
 */
function overlaps(a: WeekItem, b: WeekItem): boolean {
  const [ca, cb] = [chosenEnd(a), chosenEnd(b)];
  if (!ca && !cb) return false;
  const aEnd = ca ?? new Date(a.startsAt.getTime() + 3_600_000);
  const bEnd = cb ?? new Date(b.startsAt.getTime() + 3_600_000);
  return a.startsAt < bEnd && b.startsAt < aEnd;
}

export function MyWeekGrid({
  monday,
  items,
  now,
}: {
  monday: string;
  items: WeekItem[];
  now: Date;
}) {
  const days = week(monday, items);
  const live = items.filter((i) => !i.cancelled);
  const clashing = new Set<string>();
  for (let i = 0; i < live.length; i++)
    for (let j = i + 1; j < live.length; j++)
      if (overlaps(live[i], live[j])) clashing.add(live[i].id).add(live[j].id);
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
  }).format(now);

  return (
    <div>
      <div className="flex items-center justify-between text-sm">
        <Link
          href={`/?week=${addDays(monday, -7)}#week`}
          className="text-brand-text hover:underline"
        >
          &larr; Earlier
        </Link>
        <span className="text-muted">
          {dayLabel(monday)} &ndash; {dayLabel(addDays(monday, 6))}
        </span>
        <Link
          href={`/?week=${addDays(monday, 7)}#week`}
          className="text-brand-text hover:underline"
        >
          Later &rarr;
        </Link>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-7">
        {days.map((day) => (
          <div
            key={day.date}
            className={
              day.date === today ? "rounded-lg p-1 ring-2 ring-brand/40" : "p-1"
            }
          >
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">
              {day.label}
            </h3>
            <ul className="mt-1 space-y-1.5">
              {day.items.map((e) => {
                const full =
                  e.role === "organizer" &&
                  e.capacity != null &&
                  (e.going ?? 0) >= e.capacity;
                const past = (e.endsAt ?? e.startsAt) < now;
                const tone = e.cancelled
                  ? "border-line bg-elevated text-muted line-through"
                  : past
                    ? "border-line bg-elevated text-muted"
                    : full
                      ? "border-emerald-600 bg-emerald-50 dark:bg-emerald-950/40"
                      : "border-line bg-card";
                /*
                 * The last line says the one thing this person needs: as the
                 * organizer, how many are coming; as an attendee, what they
                 * said; for a followed team's game, nothing — the fixture is
                 * the fact.
                 */
                const status = e.cancelled
                  ? "Cancelled"
                  : e.role === "organizer"
                    ? e.capacity != null
                      ? full
                        ? "Full"
                        : `${e.going} of ${e.capacity} going`
                      : `${e.going} going`
                    : e.role === "attending"
                      ? e.mine === "going"
                        ? "You're going"
                        : "Maybe"
                      : null;
                return (
                  <li key={e.id}>
                    <Link
                      href={e.href}
                      className={`block rounded-md border px-2 py-1.5 text-xs hover:opacity-90 ${tone}`}
                    >
                      <div className="font-medium">
                        {chosenEnd(e)
                          ? spanLabel(e.startsAt, e.endsAt!)
                          : timeLabel(e.startsAt)}
                      </div>
                      <div className="truncate">{e.title}</div>
                      {e.detail && (
                        <div className="truncate text-muted">{e.detail}</div>
                      )}
                      {status && <div className="mt-0.5">{status}</div>}
                      {clashing.has(e.id) && (
                        <div className="mt-0.5 font-semibold text-red-600">
                          Overlaps another
                        </div>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
