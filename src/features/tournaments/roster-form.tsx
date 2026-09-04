"use client";

import { useActionState, useState } from "react";

import type { RosterResult } from "./roster-actions";

type Player = { name: string; birthYear: string; gender: string };
type Action = (prev: RosterResult, formData: FormData) => Promise<RosterResult>;

const cell =
  "rounded-md border border-line px-2 py-1.5 text-sm bg-card";

export function RosterForm({
  action,
  initial,
  min,
  max,
}: {
  action: Action;
  initial: Player[];
  min: number;
  max: number;
}) {
  const seed = initial.length ? initial : [{ name: "", birthYear: "", gender: "" }];
  const [rows, setRows] = useState<Player[]>(seed);
  const [state, formAction, pending] = useActionState<RosterResult, FormData>(
    action,
    {},
  );

  const update = (i: number, key: keyof Player, value: string) =>
    setRows((r) => r.map((row, j) => (j === i ? { ...row, [key]: value } : row)));

  return (
    <form action={formAction} className="mt-6 space-y-2">
      <p className="text-sm text-muted">
        {min}&ndash;{max} players. {rows.filter((r) => r.name.trim()).length} entered.
      </p>
      {rows.map((row, i) => (
        <div key={i} className="flex gap-2">
          <input
            name="name"
            value={row.name}
            onChange={(e) => update(i, "name", e.target.value)}
            placeholder={`Player ${i + 1}`}
            className={`flex-1 ${cell}`}
          />
          <input
            name="birthYear"
            value={row.birthYear}
            onChange={(e) => update(i, "birthYear", e.target.value)}
            placeholder="Birth yr"
            inputMode="numeric"
            className={`w-24 ${cell}`}
          />
          <select
            name="gender"
            value={row.gender}
            onChange={(e) => update(i, "gender", e.target.value)}
            className={`w-24 ${cell}`}
          >
            <option value="">—</option>
            <option value="M">M</option>
            <option value="F">F</option>
          </select>
          <button
            type="button"
            onClick={() => setRows((r) => r.filter((_, j) => j !== i))}
            className="px-2 text-muted hover:text-red-600"
            aria-label="Remove player"
          >
            ×
          </button>
        </div>
      ))}

      <div className="flex items-center gap-3 pt-1">
        {rows.length < max && (
          <button
            type="button"
            onClick={() => setRows((r) => [...r, { name: "", birthYear: "", gender: "" }])}
            className="text-sm text-brand-text hover:underline"
          >
            + Add player
          </button>
        )}
      </div>

      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-strong disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save roster"}
        </button>
        {state.error && <span className="text-sm text-red-600 dark:text-red-400">{state.error}</span>}
        {state.ok && <span className="text-sm text-brand-text">Saved.</span>}
      </div>
    </form>
  );
}
