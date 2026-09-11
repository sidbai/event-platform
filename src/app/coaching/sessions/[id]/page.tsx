import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";

import { getCurrentUser } from "@/features/auth";
import { cancelSlot, decideBooking } from "@/features/training/actions";
import { ConfirmButton, DecisionButtons } from "@/features/training/decision-buttons";
import { parentHandles, slotById } from "@/features/training/queries";
import { isPrivate, slotState, spotsLeft } from "@/features/training/slots";
import { dayLabel, localDate, spanLabel, weekStart } from "@/features/training/week";

export const metadata: Metadata = { title: "A slot", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * One slot, as its coach sees it: who asked, who is confirmed, and the two
 * buttons per request.
 *
 * Only the coach gets here. A parent looking at the same slot sees
 * /training/[id], which shows the room left and not the names — the other
 * families booked into a group session are not a parent's to see.
 */
export default async function CoachSlotPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect(`/signin?next=/coaching/sessions/${id}`);

  const slot = await slotById(id);
  if (!slot || slot.coachId !== user.id) notFound();

  const now = new Date();
  const state = slotState(slot, slot.bookings, now);
  const names = await parentHandles(slot.bookings.map((b) => b.bookedBy));
  const live = slot.bookings.filter((b) => b.status === "requested" || b.status === "confirmed");
  const past = slot.bookings.filter((b) => b.status === "declined" || b.status === "cancelled");
  const week = weekStart(slot.startsAt);
  const label = isPrivate(slot.capacity) ? "1-on-1" : `Group of ${slot.capacity}`;
  // A coach who wrote "1-on-1" in the notes has said what the label says.
  const sameAsLabel = (slot.notes ?? "").trim().toLowerCase() === label.toLowerCase();

  return (
    <main className="mx-auto max-w-2xl px-5 py-10">
      <Link href={`/coaching?week=${week}`} className="text-sm text-brand-text hover:underline">
        &larr; Your week
      </Link>
      <h1 className="mt-4 text-2xl font-semibold tracking-tight">
        {dayLabel(localDate(slot.startsAt))}, {spanLabel(slot.startsAt, slot.endsAt)}
      </h1>
      <p className="mt-1 text-sm text-muted">
        {slot.location}
        {" · "}
        {label}
        {(slot.birthYearFrom || slot.birthYearTo) &&
          ` · born ${slot.birthYearFrom ?? ""}–${slot.birthYearTo ?? ""}`}
        {slot.notes && !sameAsLabel && ` · ${slot.notes}`}
      </p>
      <p className="mt-1 text-sm">
        {state === "cancelled" && <span className="text-muted">You took this slot down.</span>}
        {state === "past" && <span className="text-muted">Done.</span>}
        {state === "full" && <span className="font-medium">Full.</span>}
        {state === "open" && <span>{spotsLeft(slot, slot.bookings)} place(s) open.</span>}
        {state === "requested" && <span className="font-medium">Somebody is waiting on you.</span>}
      </p>

      <section className="mt-8">
        <h2 className="text-lg font-semibold">Requests and bookings</h2>
        {live.length === 0 ? (
          <p className="mt-2 text-sm text-muted">Nobody has asked yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-line">
            {live.map((b) => (
              <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <div className="text-sm">
                  <div className="font-medium">
                    {b.playerName}
                    {b.playerBirthYear && <span className="text-muted"> · {b.playerBirthYear}</span>}
                  </div>
                  <div className="text-xs text-muted">
                    asked by {names.get(b.bookedBy) ?? "someone"}
                    {b.note && ` — “${b.note}”`}
                  </div>
                </div>
                {b.status === "requested" ? (
                  <DecisionButtons decide={decideBooking.bind(null, b.id)} />
                ) : (
                  <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
                    Confirmed
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
        {past.length > 0 && (
          <details className="mt-3">
            <summary className="cursor-pointer text-xs text-muted">
              {past.length} declined or withdrawn
            </summary>
            <ul className="mt-2 space-y-1 text-xs text-muted">
              {past.map((b) => (
                <li key={b.id}>
                  {b.playerName} — {b.status}
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>

      {state !== "cancelled" && state !== "past" && (
        <section className="mt-10 border-t border-line pt-4">
          <p className="text-sm text-muted">
            Taking the slot down cancels every request and booking on it, and it
            leaves their calendars.{" "}
            <ConfirmButton
              label="Take this slot down"
              busy="Taking down…"
              action={cancelSlot.bind(null, slot.id)}
              danger
            />
          </p>
        </section>
      )}
    </main>
  );
}
