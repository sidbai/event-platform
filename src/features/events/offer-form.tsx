"use client";

import { useActionState } from "react";

import type { OfferResult } from "./offer-actions";

type Action = (prev: OfferResult, formData: FormData) => Promise<OfferResult>;

export function OfferForm({
  action,
  teams,
}: {
  action: Action;
  teams: { id: string; name: string }[];
}) {
  const [state, formAction, pending] = useActionState<OfferResult, FormData>(
    action,
    {},
  );

  if (state.ok) {
    return (
      <p className="mt-3 text-sm text-emerald-700 dark:text-emerald-400">
        Offer sent — the organizer will be in touch.
      </p>
    );
  }

  return (
    <form action={formAction} className="mt-3 space-y-2">
      <select
        name="teamId"
        defaultValue={teams.length === 1 ? teams[0].id : ""}
        className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
      >
        <option value="" disabled>
          Which of your teams?
        </option>
        {teams.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>
      <textarea
        name="message"
        rows={2}
        placeholder="Age, level, where you can play, contact…"
        className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
      />
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
        >
          {pending ? "Sending…" : "Offer to play"}
        </button>
        {state.error && (
          <span className="text-sm text-red-600 dark:text-red-400">{state.error}</span>
        )}
      </div>
    </form>
  );
}
