/**
 * Who may ask for a team, and what asking buys — pure, so the rules can be
 * tested without a database or a session.
 *
 * Nearly every team here was created by an import: 1,608 of 1,610, none of
 * them with a person behind them. The coach whose side it is cannot fix the
 * name a platform published, put their crest on it, or take a scrimmage
 * offer, because there is no way to say "this one is mine".
 *
 * Never self-serve. A team page is not a listing to correct — it carries a
 * squad, a calendar, and a roster of children's names, ages and genders. The
 * cost of handing one to the wrong person is not a bad edit, so an admin
 * decides, exactly as they do for a coach page.
 *
 * And an approved claim grants MANAGER, not owner: enough to run the team,
 * short of deleting it or hiding it from the directory. If a claim turns out
 * to be wrong, the damage is bounded and the row is still there.
 */

export type ClaimStatus = "pending" | "approved" | "rejected";

export type ClaimableTeam = {
  id: string;
  /** Set once somebody holds the team. Almost always null. */
  ownerId: string | null;
  /** 'public' or 'private' — a private team is somebody's promise already. */
  visibility: string;
};

export type Viewer = { id: string; admin: boolean } | null;

/** What an approved claim makes somebody. Deliberately not "owner". */
export const CLAIMED_ROLE = "manager" as const;

/**
 * The shortest true reason a claim cannot be asked for, or null when it can.
 *
 * A reason rather than a boolean, because the button and the action need the
 * same answer and the page has to say why it is not there — "you already
 * asked" and "somebody already has this team" are different things to the
 * person reading them.
 */
export function claimRefusal(
  team: ClaimableTeam,
  viewer: Viewer,
  existing: ClaimStatus | null,
): string | null {
  if (viewer === null) return "Sign in to claim a team.";
  if (team.ownerId !== null) return "Somebody already manages this team.";
  /*
   * A private team is already in somebody's hands, whatever the owner column
   * says: it was either created private by a person or made private since,
   * and both are a decision this should not step over.
   */
  if (team.visibility !== "public") return "This team is private.";
  if (existing === "pending") return "Your claim is waiting for review.";
  if (existing === "approved") return "You already manage this team.";
  // A refusal is final until an admin revisits it. Re-asking would only be a
  // way to wear the queue down.
  if (existing === "rejected") return "This claim was reviewed and declined.";
  return null;
}

/** Whether this viewer may ask for this team. */
export function canRequestClaim(
  team: ClaimableTeam,
  viewer: Viewer,
  existing: ClaimStatus | null,
): boolean {
  return claimRefusal(team, viewer, existing) === null;
}

/**
 * The note a claimant writes, and why it is required.
 *
 * There is no email on this platform yet, so nothing can be verified
 * automatically — no club domain to check, no message to send. This sentence
 * is the whole of what an admin has to go on, and a claim that says nothing
 * cannot be approved by anybody being careful.
 */
export const CLAIM_NOTE_MIN = 20;
export const CLAIM_NOTE_MAX = 500;

export function checkClaimNote(
  raw: string,
): { ok: true; note: string } | { ok: false; error: string } {
  const note = raw.trim().replace(/\s+/g, " ");
  if (note.length < CLAIM_NOTE_MIN) {
    return {
      ok: false,
      error:
        "Say who you are and how somebody could check — your role, the club, and a way to reach you.",
    };
  }
  if (note.length > CLAIM_NOTE_MAX) {
    return { ok: false, error: `Keep it under ${CLAIM_NOTE_MAX} characters.` };
  }
  return { ok: true, note };
}

/** Only admins decide. A claimant approving their own is the whole failure. */
export function canDecideClaim(viewer: Viewer): boolean {
  return viewer !== null && viewer.admin;
}

/**
 * Whether a team can still be folded into another.
 *
 * mergeTeams already refuses to absorb a team somebody holds, and that is
 * right — a coach's team merged into a shell cannot be told apart afterwards.
 * The consequence is worth naming: claiming a row freezes it against the
 * duplicate cleanup, so the queue is worth emptying before the claims start
 * arriving, and an admin needs telling why a merge is refused rather than
 * being handed an error.
 */
export function blocksMerge(team: ClaimableTeam): boolean {
  return team.ownerId !== null;
}
