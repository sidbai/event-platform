"use client";

import { useActionState } from "react";

import type { SuggestionResult } from "./actions";

/**
 * Accept or dismiss one suggestion.
 *
 * Two buttons rather than one, and dismiss is as easy to reach as accept:
 * the queue is only worth reading if saying no costs nothing, and a model
 * that is wrong half the time should be cheap to disagree with.
 */
export function SuggestionButtons({
  accept,
  dismiss,
}: {
  accept: (prev: SuggestionResult) => Promise<SuggestionResult>;
  dismiss: (prev: SuggestionResult) => Promise<SuggestionResult>;
}) {
  const [state, act, pending] = useActionState<SuggestionResult, "accept" | "dismiss">(
    (prev, which) => (which === "accept" ? accept(prev) : dismiss(prev)),
    {},
  );

  if (state.detail) return <p className="text-xs text-muted">{state.detail}</p>;

  return (
    <form className="flex items-center gap-3">
      <button
        formAction={() => act("accept")}
        disabled={pending}
        className="rounded-md border border-line px-2.5 py-1 text-xs hover:bg-elevated disabled:opacity-50"
      >
        {pending ? "Working…" : "Merge them"}
      </button>
      <button
        formAction={() => act("dismiss")}
        disabled={pending}
        className="text-xs text-muted underline hover:text-ink disabled:opacity-50"
      >
        Not the same team
      </button>
      {state.error && <span className="text-xs text-red-600">{state.error}</span>}
    </form>
  );
}
