import Link from "next/link";

import { toggleLike } from "./actions";
import type { LikeSubject, LikeState } from "./queries";

/** Filled when you've hearted it, outline when you haven't. */
function Heart({ filled }: { filled: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="15"
      height="15"
      aria-hidden
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1L12 21l7.7-7.6 1.1-1a5.5 5.5 0 0 0 0-7.8z" />
    </svg>
  );
}

export function CommentIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="15"
      height="15"
      aria-hidden
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 9.9 9.9 0 0 1-4.2-.9L3 21l1.9-4.6A8.4 8.4 0 0 1 12 3a8.4 8.4 0 0 1 9 8.5z" />
    </svg>
  );
}

/**
 * The heart.
 *
 * Signed out it is a link to sign in rather than a dead button — a control
 * that silently does nothing is worse than one that explains itself.
 */
export function LikeButton({
  subjectType,
  subjectId,
  state,
  revalidate,
  signedIn,
}: {
  subjectType: LikeSubject;
  subjectId: string;
  state: LikeState;
  revalidate: string;
  signedIn: boolean;
}) {
  const label = state.mine ? "Remove your like" : "Like this";
  const base =
    "inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-xs transition-colors";

  if (!signedIn) {
    return (
      <Link
        href="/signin"
        aria-label="Sign in to like"
        className={`${base} text-muted hover:bg-elevated hover:text-ink`}
      >
        <Heart filled={false} />
        {state.count > 0 && <span className="tabular-nums">{state.count}</span>}
      </Link>
    );
  }

  return (
    <form action={toggleLike.bind(null, subjectType, subjectId, revalidate)}>
      <button
        type="submit"
        aria-label={label}
        aria-pressed={state.mine}
        className={
          state.mine
            ? `${base} text-red-500 hover:bg-elevated`
            : `${base} text-muted hover:bg-elevated hover:text-red-500`
        }
      >
        <Heart filled={state.mine} />
        {state.count > 0 && <span className="tabular-nums">{state.count}</span>}
      </button>
    </form>
  );
}
