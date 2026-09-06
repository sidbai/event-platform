"use client";

import { useActionState } from "react";

import type { ChecklistResult } from "./checklist-actions";

/**
 * Starting a checklist from the usual list.
 *
 * A client component only so the refusal has somewhere to go: two organizers
 * on the same event can both be looking at an empty list, and the second click
 * has to say why nothing happened rather than appear to do nothing.
 */
export function SeedChecklistButton({
  action,
}: {
  action: () => Promise<ChecklistResult>;
}) {
  // useActionState hands the previous state to the action; this one takes no
  // arguments beyond its bound slug, so the parameter is dropped here rather
  // than carried through the server action as an unused one.
  const [state, formAction, pending] = useActionState<ChecklistResult>(
    () => action(),
    {},
  );

  return (
    <form action={formAction} className="mt-3">
      <button
        disabled={pending}
        className="rounded-md bg-brand px-3 py-1.5 text-sm font-semibold text-on-brand hover:bg-brand-strong disabled:opacity-50"
      >
        {pending ? "Building…" : "Start from the usual list"}
      </button>
      {state.error && <p className="mt-2 text-xs text-red-600">{state.error}</p>}
    </form>
  );
}
