/**
 * Whether a new event waits for an admin before anyone can see it.
 *
 * Pure and separate because it is a policy, not a detail: it decides what this
 * site is seen to be standing behind, and it should be readable and testable
 * without reading the whole creation action around it.
 */
export function needsAdminReview(
  kind: string,
  visibility: string,
  isAdmin: boolean,
): boolean {
  // An admin approving their own submission is not a review.
  if (isAdmin) return false;

  // Review gates what reaches the public list. An unlisted or private event is
  // not going there, so making the organizer wait would cost them the ability
  // to invite anyone and gain nothing.
  if (visibility === "public") return true;

  /*
   * Tournaments and leagues are reviewed whatever their visibility says. They
   * take entries from other people's teams, run for weeks, and get a page of
   * their own that reads as endorsed by this site. A private one still does
   * all three — the visibility only limits who was told about it.
   */
  return kind === "tournament" || kind === "league";
}
