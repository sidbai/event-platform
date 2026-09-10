"use client";

import { useOptimistic, useTransition } from "react";

/**
 * Follow, and the state it is in, on one control.
 *
 * Optimistic, because the whole point of this button is that it costs
 * nothing: a parent taps it once and moves on, and a control that waits for a
 * round trip before admitting anything happened does not feel like nothing.
 *
 * Nothing here says how many other people follow the team, and there is no
 * count to say — see follow-queries: the question is never asked.
 */
export function FollowButton({
  following,
  toggle,
}: {
  following: boolean;
  toggle: () => Promise<void>;
}) {
  const [pending, start] = useTransition();
  const [shown, show] = useOptimistic(following, (_, next: boolean) => next);

  return (
    <button
      type="button"
      aria-pressed={shown}
      disabled={pending}
      onClick={() =>
        start(async () => {
          show(!shown);
          await toggle();
        })
      }
      className={
        shown
          ? "rounded-md border border-brand/40 bg-brand/10 px-3 py-1.5 text-sm font-medium text-brand-text hover:bg-brand/15 disabled:opacity-60"
          : "rounded-md border border-line px-3 py-1.5 text-sm font-medium hover:bg-elevated disabled:opacity-60"
      }
    >
      {shown ? "Following" : "Follow"}
    </button>
  );
}
