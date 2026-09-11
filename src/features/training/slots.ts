/**
 * The rules of a bookable slot, with nothing attached to them.
 *
 * Who fits, who may ask, what a coach may answer, and whether two of a
 * coach's own slots collide. Each is a question a page and an action both
 * have to agree on, and both would drift if either answered it inline — so
 * they are answered once, here, on plain values, where a test can reach every
 * branch.
 *
 * Nothing in this file knows what a database is.
 */

export type BookingStatus = "requested" | "confirmed" | "declined" | "cancelled";

export type Slot = {
  id: string;
  coachId: string;
  startsAt: Date;
  endsAt: Date;
  capacity: number;
  cancelledAt: Date | null;
};

export type Booking = {
  id: string;
  sessionId: string;
  bookedBy: string;
  playerName: string;
  status: BookingStatus;
};

/** One player is a private session; the word is derived, never stored. */
export function isPrivate(capacity: number): boolean {
  return capacity <= 1;
}

/**
 * Seats a parent can still ask for.
 *
 * Confirmed and requested both count against the room, because a coach with
 * three requests for a two-player slot has a problem to sort out, not five
 * open seats to advertise. A request they decline gives the seat back.
 */
export function spotsLeft(slot: Pick<Slot, "capacity">, bookings: Booking[]): number {
  const taken = bookings.filter(
    (b) => b.status === "confirmed" || b.status === "requested",
  ).length;
  return Math.max(0, slot.capacity - taken);
}

export type RequestRefusal =
  | "signed-out"
  | "own-slot"
  | "cancelled"
  | "past"
  | "full"
  | "already-asked";

/**
 * Whether this person may ask for this slot, for this player, right now.
 *
 * Refusals are named rather than boolean because each one is a different
 * sentence on the page, and "you can't" is the sentence that makes people
 * write in.
 */
export function canRequest(
  viewerId: string | null,
  slot: Slot,
  bookings: Booking[],
  playerName: string,
  now: Date,
): { ok: true } | { ok: false; reason: RequestRefusal } {
  if (!viewerId) return { ok: false, reason: "signed-out" };
  if (viewerId === slot.coachId) return { ok: false, reason: "own-slot" };
  if (slot.cancelledAt) return { ok: false, reason: "cancelled" };
  if (slot.startsAt.getTime() <= now.getTime()) return { ok: false, reason: "past" };

  const mine = bookings.find(
    (b) =>
      b.bookedBy === viewerId &&
      b.playerName.trim().toLowerCase() === playerName.trim().toLowerCase() &&
      (b.status === "requested" || b.status === "confirmed"),
  );
  if (mine) return { ok: false, reason: "already-asked" };

  if (spotsLeft(slot, bookings) === 0) return { ok: false, reason: "full" };
  return { ok: true };
}

export type Decision = "confirmed" | "declined";

/**
 * What a coach may do to a request.
 *
 * Only the coach, only on their own slot, and only while it is still a
 * request. A confirmed booking is not re-decided from here — the coach
 * cancels the slot, or the parent withdraws, and both of those are different
 * acts with different consequences for the other person's calendar.
 */
export function canDecide(
  viewerId: string | null,
  slot: Pick<Slot, "coachId">,
  booking: Pick<Booking, "status">,
): boolean {
  return Boolean(viewerId) && viewerId === slot.coachId && booking.status === "requested";
}

/** A parent taking their own request back, at any point before the whistle. */
export function canWithdraw(
  viewerId: string | null,
  booking: Pick<Booking, "bookedBy" | "status">,
): boolean {
  return (
    Boolean(viewerId) &&
    viewerId === booking.bookedBy &&
    (booking.status === "requested" || booking.status === "confirmed")
  );
}

/**
 * Two slots of one coach that share a minute.
 *
 * The thing this feature exists to prevent. A coach entering Sunday one slot
 * at a time will, sooner or later, put the two o'clock at two and the next at
 * two as well, and the page should say so before a parent books both. A slot
 * ending at three and one starting at three do not overlap.
 */
export function overlaps(
  a: Pick<Slot, "startsAt" | "endsAt">,
  b: Pick<Slot, "startsAt" | "endsAt">,
): boolean {
  return a.startsAt.getTime() < b.endsAt.getTime() && b.startsAt.getTime() < a.endsAt.getTime();
}

/** Every slot in the list that collides with another, by id. */
export function collisions(slots: Slot[]): Set<string> {
  const out = new Set<string>();
  const live = slots.filter((s) => !s.cancelledAt);
  for (let i = 0; i < live.length; i++) {
    for (let j = i + 1; j < live.length; j++) {
      if (live[i].coachId !== live[j].coachId) continue;
      if (overlaps(live[i], live[j])) {
        out.add(live[i].id);
        out.add(live[j].id);
      }
    }
  }
  return out;
}

export type SlotState = "cancelled" | "past" | "full" | "requested" | "open";

/**
 * The one word a coach's calendar colours a slot by.
 *
 * Ordered by what needs attention: a slot with a request waiting is the
 * thing to look at, before an open one and long before a full one. "Full"
 * means every seat is confirmed — a full slot with a request still pending
 * is "requested", because that request needs an answer even if it is no.
 */
export function slotState(slot: Slot, bookings: Booking[], now: Date): SlotState {
  if (slot.cancelledAt) return "cancelled";
  if (slot.endsAt.getTime() <= now.getTime()) return "past";
  if (bookings.some((b) => b.status === "requested")) return "requested";
  const confirmed = bookings.filter((b) => b.status === "confirmed").length;
  if (confirmed >= slot.capacity) return "full";
  return "open";
}

/**
 * Validation for a slot as a coach types it.
 *
 * Errors are keyed by field so the form can put each one where it belongs.
 */
export function slotErrors(input: {
  startsAt: Date | null;
  endsAt: Date | null;
  location: string;
  capacity: number;
  birthYearFrom: number | null;
  birthYearTo: number | null;
}): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!input.startsAt || Number.isNaN(input.startsAt.getTime())) {
    errors.startsAt = "When does it start?";
  }
  if (!input.endsAt || Number.isNaN(input.endsAt.getTime())) {
    errors.endsAt = "When does it end?";
  } else if (input.startsAt && input.endsAt.getTime() <= input.startsAt.getTime()) {
    errors.endsAt = "It has to end after it starts.";
  } else if (input.startsAt && input.endsAt.getTime() - input.startsAt.getTime() > 6 * 3_600_000) {
    errors.endsAt = "That's longer than six hours — did you mean several slots?";
  }
  if (input.location.trim().length < 2) errors.location = "Where is it?";
  if (!Number.isInteger(input.capacity) || input.capacity < 1 || input.capacity > 30) {
    errors.capacity = "Between 1 and 30 players.";
  }
  const year = (y: number | null) => y === null || (y >= 1990 && y <= 2030);
  if (!year(input.birthYearFrom) || !year(input.birthYearTo)) {
    errors.birthYears = "Birth years look wrong.";
  } else if (
    input.birthYearFrom !== null &&
    input.birthYearTo !== null &&
    input.birthYearFrom > input.birthYearTo
  ) {
    errors.birthYears = "The first year should be the earlier one.";
  }
  return errors;
}
