import Link from "next/link";
import type { Metadata } from "next";

import { getCurrentUser } from "@/features/auth";
import { upcomingSlots } from "@/features/training/queries";
import { isPrivate, slotState, spotsLeft } from "@/features/training/slots";
import { dayLabel, localDate, spanLabel } from "@/features/training/week";

export const metadata: Metadata = {
  title: "Training sessions",
  description: "Private and small-group sessions coaches have opened up, by day.",
};
export const dynamic = "force-dynamic";

/**
 * What is on, by day.
 *
 * A parent's question is "Sunday — who has something?", so the page is days
 * with slots under them, not coaches with slots under them. Each line says
 * the four things that decide it: when, where, who, and for whom. Full
 * slots stay on the page, because "too late" is useful and "nothing this
 * weekend" is false.
 */
/** A coach who writes "1-on-1" in the notes has said what the badge says. */
function sameAsLabel(s: { capacity: number; notes: string | null }): boolean {
  const label = isPrivate(s.capacity) ? "1-on-1" : "group";
  return (s.notes ?? "").trim().toLowerCase() === label;
}

export default async function TrainingPage() {
  const now = new Date();
  const [slots, user] = await Promise.all([upcomingSlots(now), getCurrentUser()]);

  const byDay = new Map<string, typeof slots>();
  for (const s of slots) {
    const d = localDate(s.startsAt);
    byDay.set(d, [...(byDay.get(d) ?? []), s]);
  }

  return (
    <main className="mx-auto max-w-3xl px-5 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Training sessions</h1>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        Slots coaches have opened up over the next three weeks. Ask for one; the
        coach confirms, and it lands in your calendar.{" "}
        {user?.coachName ? (
          <Link href="/coaching" className="text-brand-text hover:underline">
            Your coaching week &rarr;
          </Link>
        ) : (
          <Link href="/coaching" className="text-brand-text hover:underline">
            Coach? Publish your slots &rarr;
          </Link>
        )}
      </p>

      {byDay.size === 0 ? (
        <p className="mt-8 text-muted">Nothing published for the next three weeks.</p>
      ) : (
        <div className="mt-8 space-y-8">
          {[...byDay].map(([date, list]) => (
            <section key={date}>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
                {dayLabel(date)}
              </h2>
              <ul className="mt-2 divide-y divide-line">
                {list.map((s) => {
                  const state = slotState(s, s.bookings, now);
                  const left = spotsLeft(s, s.bookings);
                  const years =
                    s.birthYearFrom || s.birthYearTo
                      ? `${s.birthYearFrom ?? ""}–${s.birthYearTo ?? ""}`.replace(/^–|–$/g, "")
                      : null;
                  return (
                    <li key={s.id} className="py-3">
                      <Link href={`/training/${s.id}`} className="block hover:opacity-90">
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <span className="font-medium">
                            {spanLabel(s.startsAt, s.endsAt)} &middot; {s.coachName}
                          </span>
                          <span className="text-xs text-muted">
                            {state === "full"
                              ? "Full"
                              : isPrivate(s.capacity)
                                ? "1-on-1"
                                : `Group · ${left} of ${s.capacity} left`}
                          </span>
                        </div>
                        <div className="mt-0.5 text-sm text-muted">
                          {s.location}
                          {years && ` · born ${years}`}
                          {s.notes && !sameAsLabel(s) && ` · ${s.notes}`}
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </main>
  );
}
