"use client";

import { useActionState } from "react";

import type { TeamFormResult } from "./actions";

type Action = (prev: TeamFormResult, formData: FormData) => Promise<TeamFormResult>;

const field =
  "w-full rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900";
const label = "block text-sm font-medium";

export function TeamEditForm({
  action,
  team,
}: {
  action: Action;
  team: {
    club: string | null;
    city: string | null;
    ageGroup: string | null;
    gender: string | null;
    bio: string | null;
  };
}) {
  const [state, formAction, pending] = useActionState<TeamFormResult, FormData>(
    action,
    {},
  );

  return (
    <form action={formAction} className="mt-4 space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={label} htmlFor="club">
            Club
          </label>
          <input id="club" name="club" defaultValue={team.club ?? ""} className={`mt-1 ${field}`} />
        </div>
        <div>
          <label className={label} htmlFor="city">
            City
          </label>
          <input id="city" name="city" defaultValue={team.city ?? ""} className={`mt-1 ${field}`} />
        </div>
        <div>
          <label className={label} htmlFor="ageGroup">
            Age group
          </label>
          <input
            id="ageGroup"
            name="ageGroup"
            defaultValue={team.ageGroup ?? ""}
            placeholder="U11"
            className={`mt-1 ${field}`}
          />
        </div>
        <div>
          <label className={label} htmlFor="gender">
            Gender
          </label>
          <select id="gender" name="gender" defaultValue={team.gender ?? ""} className={`mt-1 ${field}`}>
            <option value="">Any / coed</option>
            <option value="boys">Boys</option>
            <option value="girls">Girls</option>
            <option value="coed">Coed</option>
          </select>
        </div>
      </div>
      <div>
        <label className={label} htmlFor="bio">
          About
        </label>
        <textarea id="bio" name="bio" rows={3} defaultValue={team.bio ?? ""} className={`mt-1 ${field}`} />
      </div>
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save"}
        </button>
        {state.error && <span className="text-sm text-red-600">{state.error}</span>}
        {state.ok && <span className="text-sm text-emerald-600 dark:text-emerald-400">Saved.</span>}
      </div>
    </form>
  );
}

export function AddManagerForm({ action }: { action: Action }) {
  const [state, formAction, pending] = useActionState<TeamFormResult, FormData>(
    action,
    {},
  );

  return (
    <form action={formAction} className="mt-3 flex flex-wrap items-center gap-2">
      <input
        type="email"
        name="email"
        required
        placeholder="manager@email.com"
        className={`${field} max-w-xs`}
      />
      <button
        type="submit"
        disabled={pending}
        className="rounded-md border border-neutral-300 px-3 py-2 text-sm font-medium hover:bg-neutral-50 disabled:opacity-50 dark:border-neutral-700 dark:hover:bg-neutral-900"
      >
        {pending ? "Adding…" : "Add manager"}
      </button>
      {state.error && <span className="text-sm text-red-600">{state.error}</span>}
      {state.ok && <span className="text-sm text-emerald-600 dark:text-emerald-400">Added.</span>}
    </form>
  );
}
