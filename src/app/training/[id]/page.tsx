import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { getCurrentUser } from "@/features/auth";
import { requestSlot, withdrawBooking } from "@/features/training/actions";
import { ConfirmButton } from "@/features/training/decision-buttons";
import { slotById } from "@/features/training/queries";
import { RequestForm } from "@/features/training/request-form";
import { canRequest, isPrivate, slotState, spotsLeft } from "@/features/training/slots";
import { dayLabel, localDate, spanLabel } from "@/features/training/week";

export const metadata: Metadata = { title: "A training slot" };
export const dynamic = "force-dynamic";

const WHY: Record<string, string> = {
  "own-slot": "This is your own slot.",
  cancelled: "The coach has taken this slot down.",
  past: "This slot has already started.",
  full: "This slot is full.",
  "already-asked": "You have already asked for this slot.",
};

/**
 * One slot, as a parent sees it.
 *
 * When, where, who, for whom, and how much room — then the form. The other
 * families in a group session are not shown; what a parent can see of them
 * is a count. Their own request is shown with its state, because "did I
 * already ask?" is the question a parent has when they open this twice.
 */
export default async function TrainingSlotPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [slot, user] = await Promise.all([slotById(id), getCurrentUser()]);
  if (!slot) notFound();

  const now = new Date();
  const state = slotState(slot, slot.bookings, now);
  const mine = user ? slot.bookings.filter((b) => b.bookedBy === user.id) : [];
  const verdict = canRequest(user?.id ?? null, slot, slot.bookings, "", now);
  const label = isPrivate(slot.capacity) ? "1-on-1" : `Group of ${slot.capacity}`;
  // A coach who writes "1-on-1" in the notes has said what the label says.
  const sameAsLabel = (slot.notes ?? "").trim().toLowerCase() === label.toLowerCase();
  const years =
    slot.birthYearFrom || slot.birthYearTo
      ? `${slot.birthYearFrom ?? ""}–${slot.birthYearTo ?? ""}`.replace(/^–|–$/g, "")
      : null;

  return (
    <main className="mx-auto max-w-2xl px-5 py-10">
      <Link href="/training" className="text-sm text-brand-text hover:underline">
        &larr; All sessions
      </Link>
      <h1 className="mt-4 text-2xl font-semibold tracking-tight">
        {dayLabel(localDate(slot.startsAt))}, {spanLabel(slot.startsAt, slot.endsAt)}
      </h1>
      <p className="mt-1 text-sm">
        with <strong>{slot.coachName}</strong> at {slot.location}
      </p>
      <p className="mt-1 text-sm text-muted">
        {label}
        {years && ` · born ${years}`}
        {slot.notes && !sameAsLabel && ` · ${slot.notes}`}
      </p>
      <p className="mt-2 text-sm">
        {state === "full" || state === "requested" && spotsLeft(slot, slot.bookings) === 0 ? (
          <span className="font-medium">Full.</span>
        ) : state === "open" || state === "requested" ? (
          <span>
            {isPrivate(slot.capacity)
              ? "Open."
              : `${spotsLeft(slot, slot.bookings)} of ${slot.capacity} places open.`}
          </span>
        ) : (
          <span className="text-muted">{WHY[state] ?? "Not available."}</span>
        )}
      </p>

      {mine.length > 0 && (
        <section className="mt-6 rounded-xl border border-line bg-elevated p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Yours</h2>
          <ul className="mt-2 space-y-1 text-sm">
            {mine.map((b) => (
              <li key={b.id} className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  {b.playerName} —{" "}
                  {b.status === "requested"
                    ? "waiting for the coach"
                    : b.status === "confirmed"
                      ? "confirmed"
                      : b.status}
                </span>
                {(b.status === "requested" || b.status === "confirmed") && (
                  <ConfirmButton
                    label={b.status === "requested" ? "Withdraw" : "Cancel"}
                    busy="…"
                    action={withdrawBooking.bind(null, b.id)}
                    danger
                  />
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-8">
        {!user ? (
          <p className="text-sm text-muted">
            <Link href={`/signin?next=/training/${slot.id}`} className="text-brand-text hover:underline">
              Sign in
            </Link>{" "}
            to ask for this slot.{" "}
            <Link href="/why-an-account" className="text-brand-text hover:underline">
              Why an account?
            </Link>
          </p>
        ) : verdict.ok ? (
          <>
            <h2 className="text-lg font-semibold">Ask for this slot</h2>
            <div className="mt-3">
              <RequestForm action={requestSlot.bind(null, slot.id)} years={years} />
            </div>
          </>
        ) : verdict.reason === "already-asked" || mine.length > 0 ? null : (
          <p className="text-sm text-muted">{WHY[verdict.reason]}</p>
        )}
      </section>
    </main>
  );
}
