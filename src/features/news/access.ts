/**
 * Who may read, write and publish news — pure, so the rules are testable
 * without a database or a session.
 *
 * Anyone signed in may write; only an admin decides what appears on /news.
 * That is the opposite of how clubs work (community-editable, history+revert
 * instead of approval), and deliberately so: a club entry is a fact anyone can
 * correct after the event, whereas an article is the site speaking, so it gets
 * checked before it is published rather than after.
 */

export type NewsStatus = "draft" | "pending" | "published";

/** The bits of a post the rules depend on. */
export type NewsSubject = {
  status: NewsStatus;
  authorId: string | null;
};

/** The bits of a viewer the rules depend on. */
export type NewsViewer = {
  id: string;
  admin: boolean;
} | null;

function isAuthor(post: NewsSubject, viewer: NewsViewer): boolean {
  // A post whose author was deleted has authorId null; nobody is that author.
  return viewer !== null && post.authorId !== null && post.authorId === viewer.id;
}

/**
 * Published posts are public. Anything else is visible to admins and to the
 * author — without this an author's own submission would vanish the moment
 * they sent it for review.
 */
export function canViewNewsPost(post: NewsSubject, viewer: NewsViewer): boolean {
  if (post.status === "published") return true;
  if (viewer === null) return false;
  return viewer.admin || isAuthor(post, viewer);
}

/**
 * Authors edit their own work up until it goes live; after that only an admin
 * can, or approval would be theatre — an author could get an innocuous draft
 * approved and then rewrite it in place.
 */
export function canEditNewsPost(post: NewsSubject, viewer: NewsViewer): boolean {
  if (viewer === null) return false;
  if (viewer.admin) return true;
  return post.status !== "published" && isAuthor(post, viewer);
}

/** Deleting is the author's (while unpublished) or an admin's. */
export function canDeleteNewsPost(
  post: NewsSubject,
  viewer: NewsViewer,
): boolean {
  return canEditNewsPost(post, viewer);
}

/**
 * What a save turns into.
 *
 * An admin publishes directly — queueing your own post for yourself is
 * pointless. Everyone else's "send" becomes a pending submission, and their
 * unticked save stays a private draft.
 */
export function nextStatus(
  intent: "save" | "submit",
  viewer: NewsViewer,
  current: NewsStatus = "draft",
): NewsStatus {
  if (viewer === null) return "draft";
  if (viewer.admin) return intent === "submit" ? "published" : "draft";
  // A published post being edited by its author cannot happen (canEditNewsPost
  // forbids it), so there is no path here that silently unpublishes one.
  if (intent === "submit") return "pending";
  return current === "published" ? "published" : "draft";
}
