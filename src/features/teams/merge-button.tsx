"use client";

import { useActionState } from "react";

import type { MergeActionResult } from "./merge-actions";

/**
 * Confirming one merge.
 *
 * A client component so a refusal has somewhere to go. The merge checks again
 * at the database — a claimed team is never absorbed — and an admin who
 * clicks a stale row should read why nothing happened rather than watch a
 * button do nothing.
 */
export function MergeButton({
  action,
  count,
}: {
  action: (prev: MergeActionResult) => Promise<MergeActionResult>;
  count: number;
}) {
  const [state, formAction, pending] = useActionState<MergeActionResult>(
    (prev) => action(prev),
    {},
  );

  if (state.detail) return <p className="text-xs text-muted">{state.detail}</p>;

  return (
    <form action={formAction}>
      <button
        disabled={pending}
        className="rounded-md border border-line px-2.5 py-1 text-xs hover:bg-elevated disabled:opacity-50"
      >
        {pending ? "Merging…" : `Merge ${count} in`}
      </button>
      {state.error && <p className="mt-1 text-xs text-red-600">{state.error}</p>}
    </form>
  );
}
