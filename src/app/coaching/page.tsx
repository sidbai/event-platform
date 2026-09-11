import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";

import { getCurrentUser } from "@/features/auth";
import { createSlot, saveCoachName } from "@/features/training/actions";
import { coachWeek, requestsWaitingFor } from "@/features/training/queries";
import { CoachNameForm, SlotForm } from "@/features/training/slot-form";
import { WeekGrid } from "@/features/training/week-grid";
import { localDate, timeLabel, weekStart } from "@/features/training/week";

export const metadata: Metadata = {
  title: "Your coaching week",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

/**
 * The coach's page: the week, what is waiting on them, and a way to add a slot.
 *
 * The whole reason this exists is the sentence "these coaches are not time
 * management masters". So the week is the page — not a list of sessions, not
 * a settings screen — and the two things that need doing are at the top:
 * requests to answer, and a slot to add for the day they just tapped.
 *
 * Anybody signed in can open it. Becoming a coach here is filling in a name,
 * because a coach is a user who publishes slots, not a role somebody grants;
 * a slot nobody books costs nobody anything.
 */
export default async function CoachingPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string; add?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/signin?next=/coaching");

  const now = new Date();
  const { week: weekParam, add } = await searchParams;
  const monday = /^\d{4}-\d{2}-\d{2}$/.test(weekParam ?? "") ? weekParam! : weekStart(now);
  const addDate = /^\d{4}-\d{2}-\d{2}$/.test(add ?? "") ? add! : localDate(now);

  if (!user.coachName) {
    return (
      <main className="mx-auto max-w-2xl px-5 py-10">
        <h1 className="text-2xl font-semibold tracking-tight">Coach here</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          Publish the slots you have — a Sunday afternoon at Evergreen, three of
          them, two private and a group — and parents ask for one. You confirm,
          and it is in both your calendars. Everywhere else on this site you are
          a handle; here, parents are choosing a person, so say what they should
          call you.
        </p>
        <div className="mt-6">
          <CoachNameForm action={saveCoachName} name={null} blurb={null} />
        </div>
      </main>
    );
  }

  const [slots, waiting] = await Promise.all([coachWeek(user.id, monday), requestsWaitingFor(user.id, now)]);

  return (
    <main className="mx-auto max-w-6xl px-5 py-10">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Your week</h1>
        <span className="text-sm text-muted">
          Coaching as <strong className="text-ink">{user.coachName}</strong>{" "}
          <Link href="/coaching#name" className="text-brand-text hover:underline">
            change
          </Link>
        </span>
      </div>

      {waiting.length > 0 && (
        <section className="mt-6 rounded-xl border border-amber-500 bg-amber-50 p-4 dark:bg-amber-950/40">
          <h2 className="text-sm font-semibold uppercase tracking-wide">
            Waiting on you ({waiting.length})
          </h2>
          <ul className="mt-2 space-y-1 text-sm">
            {waiting.map((w) => (
              <li key={w.id}>
                <Link href={`/coaching/sessions/${w.sessionId}`} className="hover:underline">
                  <strong>{w.playerName}</strong> asked for{" "}
                  {new Intl.DateTimeFormat("en-GB", {
                    timeZone: "America/Los_Angeles",
                    weekday: "short",
                    day: "numeric",
                    month: "short",
                  }).format(w.startsAt)}{" "}
                  {timeLabel(w.startsAt)} at {w.location}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-8">
        <WeekGrid monday={monday} slots={slots} now={now} />
        {slots.length === 0 && (
          <p className="mt-4 text-sm text-muted">
            Nothing this week yet. Add a slot below, or tap + on a day.
          </p>
        )}
      </section>

      <section id="add" className="mt-10 max-w-2xl">
        <h2 className="text-lg font-semibold">Add a slot</h2>
        <p className="mt-1 text-sm text-muted">
          One slot per session. Three slots on Sunday is three of these — a
          parent books one, and you move one.
        </p>
        <div className="mt-4">
          <SlotForm action={createSlot} date={addDate} />
        </div>
      </section>

      <section id="name" className="mt-12 max-w-2xl">
        <h2 className="text-lg font-semibold">How parents know you</h2>
        <div className="mt-4">
          <CoachNameForm action={saveCoachName} name={user.coachName} blurb={user.coachBlurb} />
        </div>
      </section>
    </main>
  );
}
