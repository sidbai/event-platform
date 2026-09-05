/**
 * Who may talk to whom — pure, so the rules are testable without a database.
 *
 * A conversation is always about something both people already share: an
 * event, a team, an offer. There is no way to open one with an arbitrary
 * account, because on a youth sports site an open inbox is a private
 * adult-to-minor channel by default and nothing here records who is a minor.
 * Scoping conversations to a shared subject is what keeps every thread
 * accountable to a context someone is responsible for.
 */

export type Viewer = { id: string; admin: boolean } | null;

export type StartCheck = {
  /** The people answerable for the subject — an organizer, a team's managers. */
  recipientIds: string[];
  /** Of those, the ones who have blocked the viewer. */
  blockedByIds: string[];
  /** True when the viewer is allowed to see the subject at all. */
  canSeeSubject: boolean;
};

export type StartVerdict =
  | { ok: true; recipientIds: string[] }
  | { ok: false; reason: "signed-out" | "no-subject" | "no-recipients" | "self" | "blocked" };

/**
 * Whether this person can open a conversation about this subject.
 *
 * Deliberately strict: you must be able to see the subject, there must be
 * someone answerable for it, and it cannot be you.
 */
export function canStartConversation(
  viewer: Viewer,
  check: StartCheck,
): StartVerdict {
  if (viewer === null) return { ok: false, reason: "signed-out" };
  if (!check.canSeeSubject) return { ok: false, reason: "no-subject" };

  const others = check.recipientIds.filter((id) => id !== viewer.id);
  // Messaging a thing you run would be talking to yourself.
  if (others.length === 0) {
    return {
      ok: false,
      reason: check.recipientIds.includes(viewer.id) ? "self" : "no-recipients",
    };
  }

  const reachable = others.filter((id) => !check.blockedByIds.includes(id));
  if (reachable.length === 0) return { ok: false, reason: "blocked" };

  return { ok: true, recipientIds: reachable };
}

/**
 * Reading a thread is membership and nothing else — no separate visibility
 * flag that could drift out of step with who was actually added.
 *
 * Admins are NOT included. A private message is private; an admin reaches one
 * through a report, which is a deliberate act with a record, not by browsing.
 */
export function canReadConversation(
  participantIds: string[],
  viewer: Viewer,
): boolean {
  return viewer !== null && participantIds.includes(viewer.id);
}

/**
 * Posting needs membership, and that nobody in the thread has blocked you.
 *
 * A block stops the conversation continuing rather than deleting it: the
 * history has to survive for an admin to judge a report against.
 */
export function canPostMessage(
  participantIds: string[],
  viewer: Viewer,
  blockedByIds: string[],
): boolean {
  if (!canReadConversation(participantIds, viewer)) return false;
  return !participantIds.some(
    (id) => id !== viewer!.id && blockedByIds.includes(id),
  );
}

/** Unread when someone else has written since you last looked. */
export function isUnread(
  lastMessageAt: Date,
  lastReadAt: Date | null,
  lastAuthorId: string | null,
  viewerId: string,
): boolean {
  // Your own message never marks your own thread unread.
  if (lastAuthorId === viewerId) return false;
  if (lastReadAt === null) return true;
  return lastMessageAt.getTime() > lastReadAt.getTime();
}
