"use client";

import { useState, useTransition } from "react";

import type { AddResultState } from "./add-result-actions";

/**
 * Yes or no to a result somebody says their team played against this one.
 *
 * Two buttons and no form, because the whole decision is which one was
 * pressed — everything else is already on the proposal.
 */
export function MatchProposalButtons({
  decide,
}: {
  decide: (approve: boolean) => Promise<AddResultState>;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const press = (approve: boolean) =>
    start(async () => {
      const result = await decide(approve);
      setError(result.error ?? null);
    });

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() => press(true)}
        className="rounded-md bg-brand px-3 py-1.5 text-sm text-white disabled:opacity-60"
      >
        Confirm
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() => press(false)}
        className="rounded-md border border-line px-3 py-1.5 text-sm disabled:opacity-60"
      >
        Reject
      </button>
      {error && <span className="text-sm text-red-600">{error}</span>}
    </div>
  );
}
