"use client";

import { useActionState } from "react";

import type { ScoreResult } from "./score-actions";

/**
 * A team's bracket, editable in place.
 *
 * A bare input beside the name rather than a modal or an edit mode: setting
 * groups is eight quick edits in a row when a division is drawn, and anything
 * that costs a click to open costs eight.
 *
 * Submits on blur as well as on Enter, because the natural way to fill eight
 * of these is to type and tab.
 */
export function TeamGroupForm({
  action,
  groupLabel,
}: {
  action: (prev: ScoreResult, formData: FormData) => Promise<ScoreResult>;
  groupLabel: string | null;
}) {
  const [state, formAction] = useActionState<ScoreResult, FormData>(action, {});

  return (
    <form action={formAction} className="inline">
      <input
        name="groupLabel"
        defaultValue={groupLabel ?? ""}
        placeholder="—"
        aria-label="Bracket"
        size={3}
        className="w-10 rounded border border-line bg-card px-1 py-0.5 text-center text-xs"
        onBlur={(e) => {
          // Only when it actually changed: a blur that submits an unchanged
          // value writes a row and revalidates the page for nothing.
          if (e.currentTarget.value !== (groupLabel ?? "")) {
            e.currentTarget.form?.requestSubmit();
          }
        }}
      />
      {state.error && <span className="ml-1 text-xs text-red-600">{state.error}</span>}
    </form>
  );
}
