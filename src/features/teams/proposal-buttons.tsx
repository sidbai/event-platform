"use client";

import { useActionState } from "react";

import type { DismissResult } from "./dismiss-actions";
import type { MergeActionResult } from "./merge-actions";

/**
 * Agree or disagree with one proposed pair.
 *
 * Both answers had to be worth pressing. Merging is irreversible and
 * dismissing is permanent, and until now only one of them existed — so a pair
 * you had already judged came back after every import, and the queue only
 * ever shrank by merging, never by reading.
 */
export function ProposalButtons({
  merge,
  dismiss,
}: {
  merge: (prev: MergeActionResult) => Promise<MergeActionResult>;
  dismiss: (prev: DismissResult) => Promise<DismissResult>;
}) {
  const [state, act, pending] = useActionState<
    MergeActionResult & DismissResult,
    "merge" | "dismiss"
  >((prev, which) => (which === "merge" ? merge(prev) : dismiss(prev)), {});

  if (state.detail) return <p className="text-xs text-muted">{state.detail}</p>;

  return (
    <form className="flex items-center gap-3">
      <button
        formAction={() => act("merge")}
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
