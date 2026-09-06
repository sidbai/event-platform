/**
 * Whether a division is taking registrations, and if not, why.
 *
 * Pure, because every one of these edges is a date or a count comparison that
 * is easy to get subtly wrong and impossible to check by looking at a page:
 * a window that has not opened reads the same as one that has closed unless
 * the code says which.
 */

export type Division = {
  capacity: number | null;
  registrationOpensAt: Date | null;
  registrationClosesAt: Date | null;
};

export type Openness =
  | { open: true; spotsLeft: number | null }
  | { open: false; reason: "not-yet" | "closed" | "full"; spotsLeft: 0 | null };

export function opennessOf(
  division: Division,
  acceptedCount: number,
  now: Date,
): Openness {
  const { capacity, registrationOpensAt, registrationClosesAt } = division;

  // Order matters. A division that is both full and past its close date is
  // reported as closed, because reopening it would not free a place — telling
  // someone "full" invites them to ask about a waitlist that cannot help.
  if (registrationClosesAt && now > registrationClosesAt) {
    return { open: false, reason: "closed", spotsLeft: 0 };
  }
  if (registrationOpensAt && now < registrationOpensAt) {
    // Deliberately no spotsLeft: before a window opens, a count of places is
    // a number that can still change and reads as a promise.
    return { open: false, reason: "not-yet", spotsLeft: null };
  }

  if (capacity === null) return { open: true, spotsLeft: null };

  const left = capacity - acceptedCount;
  if (left <= 0) return { open: false, reason: "full", spotsLeft: 0 };
  return { open: true, spotsLeft: left };
}

/** Money as an organizer wrote it, for display only. */
export function formatFee(cents: number | null): string {
  if (cents === null) return "Free";
  if (cents % 100 === 0) return `$${cents / 100}`;
  return `$${(cents / 100).toFixed(2)}`;
}
