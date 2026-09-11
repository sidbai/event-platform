"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { db } from "@/db";
import { sessionBookings, trainingSessions, users } from "@/db/schema";
import { getCurrentUser } from "@/features/auth";
import { checkRateLimit } from "@/features/rate-limit";

import { slotById } from "./queries";
import { canDecide, canRequest, canWithdraw, slotErrors, type Decision } from "./slots";
import { zonedInstant } from "./week";

/**
 * Everything that changes a slot or a booking.
 *
 * Each action re-reads what it is about and re-checks the rule in `slots.ts`
 * before writing, rather than trusting that the page which rendered the
 * button was current. A parent can have the request form open while the
 * coach fills the slot from another tab; the form is the stale one, and the
 * action is where that has to be caught.
 *
 * Ids of slots and bookings are accepted from the page, but the *person* is
 * never — it is always the session. Nothing here lets a form say who is
 * asking.
 */

export type ActionResult = {
  ok?: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
};

const REFUSALS: Record<string, string> = {
  "signed-out": "Sign in to book a session.",
  "own-slot": "That's your own slot.",
  cancelled: "The coach has taken this slot down.",
  past: "That slot has already started.",
  full: "That slot just filled up.",
  "already-asked": "You've already asked for this slot for that player.",
};

const NAME_MAX = 60;
const TEXT_MAX = 600;

/** Become a coach, or change how you are known as one. */
export async function saveCoachName(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { error: REFUSALS["signed-out"] };

  const name = String(formData.get("name") ?? "").trim();
  const blurb = String(formData.get("blurb") ?? "").trim();
  if (name.length < 2) return { fieldErrors: { name: "What should parents call you?" } };
  if (name.length > NAME_MAX) return { fieldErrors: { name: "That's a long name." } };
  if (blurb.length > TEXT_MAX) return { fieldErrors: { blurb: "Keep it to a few sentences." } };

  await db
    .update(users)
    .set({ coachName: name, coachBlurb: blurb || null })
    .where(eq(users.id, user.id));

  revalidatePath("/coaching");
  return { ok: true };
}

/**
 * Publish one slot.
 *
 * Takes a local date and two local times, because that is how a coach
 * thinks about Sunday — not as two instants in UTC. `zonedInstant` is the
 * one line that decides whether every slot is right by an hour twice a year.
 */
export async function createSlot(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { error: REFUSALS["signed-out"] };
  if (!user.coachName) return { error: "Say what parents should call you first." };

  const gate = await checkRateLimit("training:slot", user);
  if (!gate.ok) return { error: gate.message };

  const date = String(formData.get("date") ?? "");
  const start = String(formData.get("start") ?? "");
  const end = String(formData.get("end") ?? "");
  const valid = (s: string, re: RegExp) => re.test(s);
  const startsAt =
    valid(date, /^\d{4}-\d{2}-\d{2}$/) && valid(start, /^\d{2}:\d{2}$/)
      ? zonedInstant(date, start)
      : null;
  const endsAt =
    valid(date, /^\d{4}-\d{2}-\d{2}$/) && valid(end, /^\d{2}:\d{2}$/)
      ? zonedInstant(date, end)
      : null;

  const year = (key: string) => {
    const raw = String(formData.get(key) ?? "").trim();
    return raw === "" ? null : Number(raw);
  };
  const input = {
    startsAt,
    endsAt,
    location: String(formData.get("location") ?? "").trim(),
    capacity: Number(formData.get("capacity") ?? 1),
    birthYearFrom: year("birthYearFrom"),
    birthYearTo: year("birthYearTo"),
  };
  const errors = slotErrors(input);
  if (Object.keys(errors).length) return { fieldErrors: errors };

  const notes = String(formData.get("notes") ?? "").trim();
  if (notes.length > TEXT_MAX) return { fieldErrors: { notes: "Keep it short." } };

  await db.insert(trainingSessions).values({
    coachId: user.id,
    startsAt: input.startsAt!,
    endsAt: input.endsAt!,
    location: input.location.slice(0, 200),
    capacity: input.capacity,
    birthYearFrom: input.birthYearFrom,
    birthYearTo: input.birthYearTo,
    notes: notes || null,
  });

  revalidatePath("/coaching");
  revalidatePath("/training");
  return { ok: true };
}

/**
 * Take a slot down.
 *
 * Kept, not deleted: every parent with a request or a booking on it needs
 * to see that it was cancelled, and their calendar needs the entry to go.
 * Their bookings are marked cancelled too, so nothing on their page says
 * "confirmed" about a session that is not happening.
 */
export async function cancelSlot(sessionId: string): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { error: REFUSALS["signed-out"] };

  const slot = await slotById(sessionId);
  if (!slot || slot.coachId !== user.id) return { error: "That's not your slot." };
  if (slot.cancelledAt) return { ok: true };

  const now = new Date();
  await db.transaction(async (tx) => {
    await tx
      .update(trainingSessions)
      .set({ cancelledAt: now, updatedAt: now })
      .where(eq(trainingSessions.id, sessionId));
    await tx
      .update(sessionBookings)
      .set({ status: "cancelled", decidedAt: now })
      .where(
        and(
          eq(sessionBookings.sessionId, sessionId),
          eq(sessionBookings.status, "requested"),
        ),
      );
    await tx
      .update(sessionBookings)
      .set({ status: "cancelled", decidedAt: now })
      .where(
        and(
          eq(sessionBookings.sessionId, sessionId),
          eq(sessionBookings.status, "confirmed"),
        ),
      );
  });

  revalidatePath("/coaching");
  revalidatePath("/training");
  revalidatePath("/me");
  return { ok: true };
}

/** A parent asking for a slot, for one named player. */
export async function requestSlot(
  sessionId: string,
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { error: REFUSALS["signed-out"] };

  const playerName = String(formData.get("playerName") ?? "").trim();
  if (playerName.length < 1) return { fieldErrors: { playerName: "Who is the session for?" } };
  if (playerName.length > NAME_MAX) return { fieldErrors: { playerName: "That's a long name." } };

  const rawYear = String(formData.get("playerBirthYear") ?? "").trim();
  const playerBirthYear = rawYear === "" ? null : Number(rawYear);
  if (playerBirthYear !== null && (!Number.isInteger(playerBirthYear) || playerBirthYear < 2000 || playerBirthYear > 2030)) {
    return { fieldErrors: { playerBirthYear: "That birth year looks wrong." } };
  }

  const note = String(formData.get("note") ?? "").trim();
  if (note.length > TEXT_MAX) return { fieldErrors: { note: "Keep it short." } };

  const gate = await checkRateLimit("training:request", user);
  if (!gate.ok) return { error: gate.message };

  const slot = await slotById(sessionId);
  if (!slot) return { error: "That slot is gone." };

  const verdict = canRequest(user.id, slot, slot.bookings, playerName, new Date());
  if (!verdict.ok) return { error: REFUSALS[verdict.reason] };

  await db
    .insert(sessionBookings)
    .values({
      sessionId,
      bookedBy: user.id,
      playerName,
      playerBirthYear,
      note: note || null,
    })
    // The unique key is (slot, parent, player); a double submit is one row.
    .onConflictDoNothing();

  revalidatePath(`/training/${sessionId}`);
  revalidatePath("/training");
  revalidatePath("/coaching");
  revalidatePath("/me");
  return { ok: true };
}

/** The coach answering a request, yes or no. */
export async function decideBooking(bookingId: string, decision: Decision): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { error: REFUSALS["signed-out"] };

  const booking = await db.query.sessionBookings.findFirst({
    where: eq(sessionBookings.id, bookingId),
    columns: { id: true, sessionId: true, status: true },
  });
  if (!booking) return { error: "That request is gone." };

  const slot = await slotById(booking.sessionId);
  if (!slot || !canDecide(user.id, slot, booking)) return { error: "That's not yours to answer." };

  await db
    .update(sessionBookings)
    .set({ status: decision, decidedAt: new Date() })
    .where(and(eq(sessionBookings.id, bookingId), eq(sessionBookings.status, "requested")));

  revalidatePath("/coaching");
  revalidatePath(`/coaching/sessions/${slot.id}`);
  revalidatePath("/me");
  return { ok: true };
}

/** A parent taking their own request or booking back. */
export async function withdrawBooking(bookingId: string): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { error: REFUSALS["signed-out"] };

  const booking = await db.query.sessionBookings.findFirst({
    where: eq(sessionBookings.id, bookingId),
    columns: { id: true, sessionId: true, bookedBy: true, status: true },
  });
  if (!booking || !canWithdraw(user.id, booking)) return { error: "That's not yours to withdraw." };

  await db
    .update(sessionBookings)
    .set({ status: "cancelled", decidedAt: new Date() })
    .where(eq(sessionBookings.id, bookingId));

  revalidatePath("/me");
  revalidatePath(`/training/${booking.sessionId}`);
  revalidatePath("/coaching");
  return { ok: true };
}

/** After the first slot is saved, the coach lands on their week. */
export async function toCoachingWeek(): Promise<never> {
  redirect("/coaching");
}
