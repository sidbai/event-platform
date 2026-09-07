"use client";

import { useActionState } from "react";

import type { LinkResult } from "./link-actions";

/**
 * Confirming one grouping.
 *
 * A client component so a refusal has somewhere to go: the club may have been
 * renamed or removed since the page was drawn, and an admin who clicks a
 * stale row should read why nothing happened.
 */
export function LinkButton({
  action,
  label,
  tone = "solid",
}: {
  action: (prev: LinkResult) => Promise<LinkResult>;
  label: string;
  tone?: "solid" | "quiet";
}) {
  const [state, formAction, pending] = useActionState<LinkResult>(
    (prev) => action(prev),
    {},
  );

  if (state.detail) return <p className="text-xs text-muted">{state.detail}</p>;

  return (
    <form action={formAction} className="inline">
      <button
        disabled={pending}
        className={
          tone === "solid"
            ? "rounded-md border border-line px-2.5 py-1 text-xs hover:bg-elevated disabled:opacity-50"
            : "text-xs text-muted underline hover:text-ink disabled:opacity-50"
        }
      >
        {pending ? "Saving…" : label}
      </button>
      {state.error && <p className="mt-1 text-xs text-red-600">{state.error}</p>}
    </form>
  );
}
