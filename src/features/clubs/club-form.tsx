"use client";

import { useActionState } from "react";

import type { ClubResult } from "./constants";

type Action = (prev: ClubResult, formData: FormData) => Promise<ClubResult>;

const field = "w-full rounded-md border border-line bg-card px-3 py-2 text-sm";
const label = "block text-sm font-medium";

export function ClubForm({ action }: { action: Action }) {
  const [state, formAction, pending] = useActionState<ClubResult, FormData>(
    action,
    {},
  );
  const err = state.fieldErrors ?? {};

  return (
    <form action={formAction} className="mt-6 space-y-5">
      <div>
        <label className={label} htmlFor="name">
          Club name
        </label>
        <input id="name" name="name" autoFocus className={`mt-1 ${field}`} />
        {err.name && <p className="mt-1 text-xs text-red-600">{err.name}</p>}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={label} htmlFor="city">
            City <span className="text-muted">(optional)</span>
          </label>
          <input id="city" name="city" placeholder="Bellevue" className={`mt-1 ${field}`} />
        </div>
        <div>
          <label className={label} htmlFor="website">
            Website <span className="text-muted">(optional)</span>
          </label>
          <input id="website" name="website" type="url" placeholder="https://…" className={`mt-1 ${field}`} />
        </div>
      </div>
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-on-brand hover:bg-brand-strong disabled:opacity-50"
      >
        {pending ? "Adding…" : "Add club"}
      </button>
    </form>
  );
}
