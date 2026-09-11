import Link from "next/link";

import { collisions, slotState, spotsLeft, isPrivate, type SlotState } from "./slots";
import type { SlotWithBookings } from "./queries";
import { addDays, dayLabel, spanLabel, week } from "./week";

/**
 * The coach's week, which is the page they live on.
 *
 * Seven columns, every slot in the column of the day it starts, and one word
 * of colour per slot for the thing that needs their attention. A request
 * waiting is the loudest, because it is the one thing on this page that is
 * somebody else waiting on them. Two slots that share a minute get a mark,
 * because entering Sunday one slot at a time is exactly how the two o'clock
 * ends up entered twice.
 *
 * Server-rendered and made of links. A coach on a phone between sessions
 * needs to see the week and tap a slot, not drag one.
 */

const TONE: Record<SlotState, string> = {
  requested: "border-amber-500 bg-amber-50 dark:bg-amber-950/40",
  open: "border-line bg-card",
  full: "border-emerald-600 bg-emerald-50 dark:bg-emerald-950/40",
  past: "border-line bg-elevated text-muted",
  cancelled: "border-line bg-elevated text-muted line-through",
};

const WORD: Record<SlotState, string> = {
  requested: "Waiting on you",
  open: "Open",
  full: "Full",
  past: "Done",
  cancelled: "Cancelled",
};

export function WeekGrid({
  monday,
  slots,
  now,
}: {
  monday: string;
  slots: SlotWithBookings[];
  now: Date;
}) {
  const days = week(monday, slots);
  const clashing = collisions(slots);
  const prev = addDays(monday, -7);
  const next = addDays(monday, 7);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(now);

  return (
    <div>
      <div className="flex items-center justify-between text-sm">
        <Link href={`/coaching?week=${prev}`} className="text-brand-text hover:underline">
          &larr; Earlier
        </Link>
        <span className="text-muted">
          {dayLabel(monday)} &ndash; {dayLabel(addDays(monday, 6))}
        </span>
        <Link href={`/coaching?week=${next}`} className="text-brand-text hover:underline">
          Later &rarr;
        </Link>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-7">
        {days.map((day) => (
          <div key={day.date} className={day.date === today ? "rounded-lg ring-2 ring-brand/40 p-1" : "p-1"}>
            <div className="flex items-baseline justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">{day.label}</h3>
              <Link
                href={`/coaching?week=${monday}&add=${day.date}#add`}
                className="text-xs text-brand-text hover:underline"
                title="Add a slot on this day"
              >
                +
              </Link>
            </div>
            <ul className="mt-1 space-y-1.5">
              {day.items.map((slot) => {
                const state = slotState(slot, slot.bookings, now);
                const left = spotsLeft(slot, slot.bookings);
                const waiting = slot.bookings.filter((b) => b.status === "requested").length;
                return (
                  <li key={slot.id}>
                    <Link
                      href={`/coaching/sessions/${slot.id}`}
                      className={`block rounded-md border px-2 py-1.5 text-xs hover:opacity-90 ${TONE[state]}`}
                    >
                      <div className="font-medium">{spanLabel(slot.startsAt, slot.endsAt)}</div>
                      <div className="truncate text-muted">{slot.location}</div>
                      <div className="mt-0.5">
                        {WORD[state]}
                        {state === "requested" && ` (${waiting})`}
                        {state === "open" && !isPrivate(slot.capacity) && ` · ${left} of ${slot.capacity} left`}
                        {state === "open" && isPrivate(slot.capacity) && " · 1-on-1"}
                      </div>
                      {clashing.has(slot.id) && (
                        <div className="mt-0.5 font-semibold text-red-600">Overlaps another slot</div>
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
