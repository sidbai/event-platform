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

/**
 * Openness as a person would say it.
 *
 * Extracted from the entry page, which had it inline, once a second page
 * needed to say the same thing. Two copies of this would drift into a division
 * described as open on one page and closed on another, which is the kind of
 * disagreement that costs a team its place.
 *
 * Dates arrive already formatted, because formatting them needs the event's
 * timezone and this stays free of it.
 */
export function describeOpenness(
  openness: Openness,
  acceptedCount: number,
  dates: { opens?: string | null; closes?: string | null } = {},
): string {
  if (openness.open) {
    const head =
      openness.spotsLeft === null
        ? "Open for entries"
        : `${openness.spotsLeft} place${openness.spotsLeft === 1 ? "" : "s"} left`;
    return dates.closes ? `${head} · closes ${dates.closes}` : head;
  }
  if (openness.reason === "not-yet") {
    return dates.opens ? `Entries open ${dates.opens}` : "Entries open soon";
  }
  if (openness.reason === "full") {
    return `Full — ${acceptedCount} team${acceptedCount === 1 ? "" : "s"} entered`;
  }
  return dates.closes ? `Entries closed ${dates.closes}` : "Entries closed";
}
