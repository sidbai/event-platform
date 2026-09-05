/**
 * Who may claim a coach page, and what claiming buys — pure, so the rules can
 * be tested without a database or a session.
 *
 * Claiming grants exactly one power: replying to reviews about you. It is not
 * ownership. A claimant cannot edit a review, hide one, or review themselves,
 * because every one of those would turn a right of reply into control over
 * what is said.
 */

export type ClaimStatus = "pending" | "approved" | "rejected";

export type CoachSubject = {
  id: string;
  claimedBy: string | null;
};

export type Viewer = { id: string; admin: boolean } | null;

/** True when this viewer is the confirmed coach. */
export function isTheCoach(coach: CoachSubject, viewer: Viewer): boolean {
  return (
    viewer !== null &&
    coach.claimedBy !== null &&
    coach.claimedBy === viewer.id
  );
}

/**
 * A page can be claimed while nobody holds it, by anyone signed in who has not
 * already asked. An admin approves or refuses — self-serve would let anyone
 * take the right to answer reviews about another person.
 */
export function canRequestClaim(
  coach: CoachSubject,
  viewer: Viewer,
  existing: ClaimStatus | null,
): boolean {
  if (viewer === null) return false;
  if (coach.claimedBy !== null) return false;
  // A refusal is final until an admin revisits it; re-asking would just be a
  // way to wear the queue down.
  return existing === null;
}

/** Only the confirmed coach answers reviews about them; admins never post as them. */
export function canReplyToReview(coach: CoachSubject, viewer: Viewer): boolean {
  return isTheCoach(coach, viewer);
}

/**
 * A reply can be taken down by whoever wrote it, or by an admin moderating it.
 * Admins can remove but never author — a reply carries the coach's name.
 */
export function canRemoveReply(replyAuthorId: string, viewer: Viewer): boolean {
  if (viewer === null) return false;
  return viewer.admin || viewer.id === replyAuthorId;
}

/**
 * Nobody reviews themselves.
 *
 * Without this a coach could claim their page and post a five-star review the
 * moment they arrived — and unlike the club case there is no work-email
 * equivalent to catch it, so the claim is the only signal we have.
 */
export function canReviewCoach(coach: CoachSubject, viewer: Viewer): boolean {
  if (viewer === null) return false;
  return !isTheCoach(coach, viewer);
}
