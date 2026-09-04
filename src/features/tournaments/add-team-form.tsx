"use client";

import { useActionState } from "react";

import type { ScoreResult } from "./score-actions";

type Division = { id: string; name: string; label: string | null };
type Action = (prev: ScoreResult, formData: FormData) => Promise<ScoreResult>;

const field =
  "rounded-md border border-neutral-300 px-2 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-900";

export function AddTeamForm({
  action,
  divisions,
}: {
  action: Action;
  divisions: Division[];
}) {
  const [state, formAction, pending] = useActionState<ScoreResult, FormData>(
    action,
    {},
  );

  return (
    <form action={formAction} className="mt-3 flex flex-wrap items-end gap-2">
      <label className="text-xs">
        <span className="block text-neutral-500">Team name</span>
        <input name="name" required className={`mt-0.5 ${field}`} />
      </label>
      {divisions.length > 1 ? (
        <label className="text-xs">
          <span className="block text-neutral-500">Division</span>
          <select name="divisionId" className={`mt-0.5 ${field}`}>
            {divisions.map((d) => (
              <option key={d.id} value={d.id === "none" ? "" : d.id}>
                {d.label ?? d.name}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <input
          type="hidden"
          name="divisionId"
          value={divisions[0]?.id === "none" ? "" : (divisions[0]?.id ?? "")}
        />
      )}
      <label className="text-xs">
        <span className="block text-neutral-500">Group</span>
        <input name="groupLabel" placeholder="1" className={`mt-0.5 w-16 ${field}`} />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-medium hover:bg-neutral-50 disabled:opacity-50 dark:border-neutral-700 dark:hover:bg-neutral-900"
      >
        {pending ? "Adding…" : "Add team"}
      </button>
      {state.error && <span className="text-xs text-red-600">{state.error}</span>}
      {state.ok && <span className="text-xs text-emerald-600 dark:text-emerald-400">Added.</span>}
    </form>
  );
}
