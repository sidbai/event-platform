"use client";

import { useActionState } from "react";

import type { ActionResult } from "./actions";

type Action = (prev: ActionResult, formData: FormData) => Promise<ActionResult>;

const field = "w-full rounded-md border border-line bg-card px-3 py-2 text-sm";

/**
 * A parent asking for a slot.
 *
 * Three fields, one of them required: the player's name. The coach is the
 * one who needs to know who is turning up, and "Joshua, 2015" is the whole
 * of what they need. The note is for "he's a keeper" and "we'll be ten
 * minutes late" — the things a parent says at the gate, said in advance.
 */
export function RequestForm({ action, years }: { action: Action; years: string | null }) {
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(action, {});
  const err = (k: string) =>
    state.fieldErrors?.[k] ? <p className="text-xs text-red-600">{state.fieldErrors[k]}</p> : null;

  if (state.ok) {
    return (
      <p className="rounded-md border border-line bg-elevated px-3 py-2 text-sm">
        Asked. The coach will confirm or decline, and you will see it on{" "}
        <a href="/me" className="text-brand-text hover:underline">
          your page
        </a>
        . Nothing is booked until they say yes.
      </p>
    );
  }

  return (
    <form action={formAction} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="text-muted">Player</span>
          <input name="playerName" required maxLength={60} placeholder="Joshua" className={field} />
          {err("playerName")}
        </label>
        <label className="block text-sm">
          <span className="text-muted">Born{years ? ` (this slot is for ${years})` : ""}</span>
          <input name="playerBirthYear" type="number" min={2000} max={2030} placeholder="2015" className={field} />
          {err("playerBirthYear")}
        </label>
      </div>
      <label className="block text-sm">
        <span className="text-muted">Anything the coach should know (optional)</span>
        <input name="note" maxLength={600} placeholder="He's a keeper · We'll be ten minutes late" className={field} />
        {err("note")}
      </label>
      <button
        disabled={pending}
        className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-on-brand hover:bg-brand-strong disabled:opacity-50"
      >
        {pending ? "Asking…" : "Ask for this slot"}
      </button>
      {state.error && <p className="text-xs text-red-600">{state.error}</p>}
    </form>
  );
}
