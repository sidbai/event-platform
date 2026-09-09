"use client";

import { useActionState } from "react";

import type { AddResultState } from "./add-result-actions";

/**
 * Five fields, and no tournament to fill in first.
 *
 * A side that flew to Dallas and played five games will add none of them if
 * the first step is creating an event record. So this asks for what somebody
 * remembers — the day, who they played, the score, and what the cup was
 * called — and works out where to file it on the other side.
 */

type Action = (prev: AddResultState, form: FormData) => Promise<AddResultState>;

const field = "rounded-md border border-line bg-card px-2 py-1.5 text-sm";

export function AddResultForm({ action }: { action: Action }) {
  const [state, formAction, pending] = useActionState<AddResultState, FormData>(
    (prev, fd) => action(prev, fd),
    {},
  );

  return (
    <details className="mt-3 rounded-lg border border-dashed border-line p-3">
      <summary className="cursor-pointer text-sm font-medium">
        Add a result we don&rsquo;t have
      </summary>
      <p className="mt-2 text-xs text-muted">
        A cup out of state, a tour abroad — anywhere our sources don&rsquo;t
        reach. It shows on this page and counts in the team&rsquo;s record,
        marked as added by the team.
      </p>

      <form action={formAction} className="mt-3 flex flex-wrap items-end gap-2">
        <label className="text-xs">
          <span className="block text-muted">Date</span>
          <input type="date" name="playedOn" required className={field} />
        </label>

        <label className="text-xs">
          <span className="block text-muted">Opponent</span>
          <input
            name="opponent"
            required
            maxLength={80}
            placeholder="FC Dallas B12 Red"
            className={`${field} w-52`}
          />
        </label>

        <label className="text-xs">
          <span className="block text-muted">Us</span>
          <input
            name="ourScore"
            required
            inputMode="numeric"
            className={`${field} w-14 tabular-nums`}
          />
        </label>

        <label className="text-xs">
          <span className="block text-muted">Them</span>
          <input
            name="theirScore"
            required
            inputMode="numeric"
            className={`${field} w-14 tabular-nums`}
          />
        </label>

        <label className="text-xs">
          <span className="block text-muted">Competition</span>
          <input
            name="competition"
            maxLength={80}
            placeholder="Dallas Cup"
            className={`${field} w-44`}
          />
        </label>

        <label className="flex items-center gap-1.5 pb-1.5 text-xs text-muted">
          <input type="checkbox" name="wasHome" />
          At home
        </label>

        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-brand px-3 py-1.5 text-sm text-white disabled:opacity-60"
        >
          {pending ? "Adding…" : "Add"}
        </button>
      </form>

      {state.error && <p className="mt-2 text-sm text-red-600">{state.error}</p>}
      {state.ok && <p className="mt-2 text-sm text-brand-text">Added.</p>}
    </details>
  );
}
