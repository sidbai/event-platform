/**
 * The only fields of a review that may be shown to anyone.
 *
 * Both review queries load the author row — they need it to resolve the
 * pseudonym and to tell you which review is yours — so the row reaching this
 * point DOES carry an identity. This function is the one place that decides
 * what survives, and it builds a fresh object rather than spreading the row,
 * because a spread is how a name gets published by accident.
 *
 * `mine` is computed here and the id it was computed from is dropped: the
 * caller learns whether this review is theirs without ever receiving whose it
 * is.
 */

export type AuthoredRow = {
  id: string;
  title: string;
  body: string;
  reviewerRole: string;
  createdAt: Date;
  author: { id: string; anonHandle: string | null } | null;
  /** Rows carry more than this — none of it is allowed through. */
  [extra: string]: unknown;
};

export type PublicReview = {
  id: string;
  title: string;
  body: string;
  reviewerRole: string;
  createdAt: Date;
  anonHandle: string;
  helpful: number;
  votedByMe: boolean;
  mine: boolean;
};

export function publicReview(
  row: AuthoredRow,
  ctx: { userId: string | null; helpful: number; votedByMe: boolean },
): PublicReview {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    reviewerRole: row.reviewerRole,
    createdAt: row.createdAt,
    // "anon" only if a handle was never allocated — the account is deleted, or
    // the review predates handles. Never a name.
    anonHandle: row.author?.anonHandle ?? "anon",
    helpful: ctx.helpful,
    votedByMe: ctx.votedByMe,
    mine: Boolean(ctx.userId && row.author?.id === ctx.userId),
  };
}
