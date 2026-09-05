/**
 * Who can see a hidden forum post — pure, so the rule is testable.
 *
 * Hiding is moderation, not deletion: the post survives, the author can still
 * see it exists, and an admin can put it back. That is the same shape as
 * hidden comments, reviews and messages.
 */

export type PostSubject = {
  hiddenAt: Date | null;
  authorId: string | null;
};

export type Viewer = { id: string; admin: boolean } | null;

export function isHidden(post: PostSubject): boolean {
  return post.hiddenAt !== null;
}

/**
 * A hidden post stays visible to admins and to its author.
 *
 * The author keeps access deliberately: someone whose post disappeared with no
 * trace cannot tell moderation from a bug, and cannot ask about it.
 */
export function canViewPost(post: PostSubject, viewer: Viewer): boolean {
  if (!isHidden(post)) return true;
  if (viewer === null) return false;
  if (viewer.admin) return true;
  return post.authorId !== null && post.authorId === viewer.id;
}

/** Hiding and unhiding are an admin's, never the author's. */
export function canSetHidden(viewer: Viewer): boolean {
  return viewer !== null && viewer.admin;
}

/** Hidden posts are listed for admins, badged, so they remain findable. */
export function includeHiddenInFeed(viewer: Viewer): boolean {
  return viewer !== null && viewer.admin;
}
