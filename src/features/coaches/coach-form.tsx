"use client";

import { useActionState } from "react";

import type { ReviewResult } from "@/features/reviews/constants";

import { COACH_ROLES } from "./constants";

type Action = (prev: ReviewResult, formData: FormData) => Promise<ReviewResult>;

const field = "w-full rounded-md border border-line bg-card px-3 py-2 text-sm";

export function CoachForm({
  action,
  clubs,
  existing,
  submitLabel,
}: {
  action: Action;
  /** Omitted when editing: a coach does not move between clubs. */
  clubs?: { id: string; name: string }[];
  existing?: {
    name: string;
    role: string;
    ageGroups: string[];
  } | null;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState<ReviewResult, FormData>(
    action,
    {},
  );
  const err = state.fieldErrors ?? {};

  return (
    <form action={formAction} className="mt-6 space-y-5">
      <div>
        <label className="block text-sm font-medium" htmlFor="name">
          Name
        </label>
        <input
          id="name"
          name="name"
          defaultValue={existing?.name}
          className={`mt-1 ${field}`}
        />
        {err.name && <p className="mt-1 text-xs text-red-600">{err.name}</p>}
      </div>

      {clubs && (
        <div>
          <label className="block text-sm font-medium" htmlFor="clubId">
            Club
          </label>
          <select id="clubId" name="clubId" defaultValue="" className={`mt-1 ${field}`}>
            <option value="">Choose…</option>
            {clubs.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-muted">
            A coach is always listed under the club they coach at.
          </p>
          {err.clubId && <p className="mt-1 text-xs text-red-600">{err.clubId}</p>}
        </div>
      )}

      <div>
        <label className="block text-sm font-medium" htmlFor="role">
          Role
        </label>
        <select
          id="role"
          name="role"
          defaultValue={existing?.role ?? "head"}
          className={`mt-1 ${field} sm:max-w-xs`}
        >
          {COACH_ROLES.map((r) => (
            <option key={r.key} value={r.key}>
              {r.label}
            </option>
          ))}
        </select>
        {err.role && <p className="mt-1 text-xs text-red-600">{err.role}</p>}
      </div>

      <div>
        <label className="block text-sm font-medium" htmlFor="ageGroups">
          Teams they coach <span className="text-muted">(optional)</span>
        </label>
        <input
          id="ageGroups"
          name="ageGroups"
          defaultValue={(existing?.ageGroups ?? []).join(", ")}
          placeholder="Boys 2013, Girls 2014"
          className={`mt-1 ${field}`}
        />
        <p className="mt-1 text-xs text-muted">Comma separated.</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-on-brand hover:bg-brand-strong disabled:opacity-50"
        >
          {pending ? "Saving…" : submitLabel}
        </button>
        <span className="text-xs text-muted">
          Coach entries are community maintained — every change is kept.
        </span>
        {state.error && <span className="text-sm text-red-600">{state.error}</span>}
        {state.ok && <span className="text-sm text-brand-text">Saved.</span>}
      </div>
    </form>
  );
}
