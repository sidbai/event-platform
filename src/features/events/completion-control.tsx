"use client";

import { useActionState } from "react";

import type { Suggestion } from "./completion";

/**
 * Marking an event finished, and unmarking it.
 *
 * A client component so the button can say what it is doing: the action reads
 * the event's current status and refuses a transition that no longer applies,
 * and a second organizer clicking a stale page should see nothing happen
 * rather than see it happen wrongly.
 */
export function CompletionControl({
  action,
  completed,
  suggestion,
}: {
  action: () => Promise<void>;
  completed: boolean;
  suggestion: Suggestion;
}) {
  const [, formAction, pending] = useActionState(async () => {
    await action();
  }, undefined);

  if (completed) {
    return (
      <form action={formAction} className="mt-3 border-t border-line pt-3">
        <p className="text-xs text-muted">
          Marked finished. It stays listed, opens on the table, and takes no
          more entries.
        </p>
        <button
          disabled={pending}
          className="mt-1.5 text-xs text-brand-text hover:underline disabled:opacity-50"
        >
          {pending ? "Reopening…" : "Reopen it"}
        </button>
      </form>
    );
  }

  return (
    <form action={formAction} className="mt-3 border-t border-line pt-3">
      {suggestion.suggest && (
        /* Nobody comes back to a tournament page on the Tuesday after to
           change a status, so the page asks rather than waiting to be found. */
        <p className="text-xs text-muted">
          This ended{" "}
          {suggestion.daysAgo === 0
            ? "today"
            : suggestion.daysAgo === 1
              ? "yesterday"
              : `${suggestion.daysAgo} days ago`}
          .{" "}
          {suggestion.unplayed > 0 && (
            <span className="text-amber-700">
              {suggestion.unplayed}{" "}
              {suggestion.unplayed === 1 ? "fixture has" : "fixtures have"} no
              score yet.
            </span>
          )}
        </p>
      )}
      <button
        disabled={pending}
        className={`text-xs disabled:opacity-50 ${
          suggestion.suggest
            ? "mt-1.5 font-medium text-brand-text hover:underline"
            : "text-muted hover:text-ink"
        }`}
      >
        {pending ? "Marking…" : "Mark this event finished"}
      </button>
    </form>
  );
}
