"use client";

import { useActionState, useState } from "react";

import type { ScoreResult } from "./score-actions";

type Action = (prev: ScoreResult, formData: FormData) => Promise<ScoreResult>;

const field = "rounded-md border border-line bg-card px-2 py-1.5 text-sm";

/**
 * A season's fixtures in one go.
 *
 * Behind a disclosure because it is a once-per-division action, not part of the
 * day-to-day of entering scores, and because it writes a lot of rows — putting
 * it beside the everyday controls invites the click nobody meant to make.
 */
export function GenerateFixturesForm({
  action,
  divisions,
}: {
  action: Action;
  divisions: { id: string; name: string; label: string | null }[];
}) {
  const [state, formAction, pending] = useActionState<ScoreResult, FormData>(
    action,
    {},
  );
  const [open, setOpen] = useState(false);

  if (divisions.length === 0) return null;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-4 text-sm text-brand-text hover:underline"
      >
        Generate a season of fixtures
      </button>
    );
  }

  return (
    <form action={formAction} className="mt-4 rounded-lg border border-line p-3">
      <p className="text-sm font-medium">Generate fixtures</p>
      <p className="mt-1 text-xs text-muted">
        Every team in the division plays every other. Brackets are scheduled
        separately, and rounds land a week apart unless you say otherwise.
      </p>

      <div className="mt-3 flex flex-wrap items-end gap-2">
        <label className="text-xs text-muted">
          Division
          <select name="divisionId" className={`mt-1 block ${field}`}>
            {divisions.map((d) => (
              <option key={d.id} value={d.id}>
                {d.label ?? d.name}
              </option>
            ))}
          </select>
        </label>

        <label className="text-xs text-muted">
          First matchday
          <input type="date" name="startDate" required className={`mt-1 block ${field}`} />
        </label>

        <label className="text-xs text-muted">
          Kickoff
          <input
            type="time"
            name="time"
            defaultValue="09:00"
            className={`mt-1 block ${field}`}
          />
        </label>

        <label className="text-xs text-muted">
          Days apart
          <input
            type="number"
            name="everyDays"
            defaultValue={7}
            min={1}
            max={60}
            className={`mt-1 block w-20 ${field}`}
          />
        </label>

        <label className="text-xs text-muted">
          Legs
          <select name="legs" defaultValue="1" className={`mt-1 block ${field}`}>
            <option value="1">Once</option>
            <option value="2">Home and away</option>
          </select>
        </label>

        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-brand px-3 py-1.5 text-sm font-semibold text-on-brand hover:bg-brand-strong disabled:opacity-50"
        >
          {pending ? "Building…" : "Generate"}
        </button>
      </div>

      {state.error && <p className="mt-2 text-xs text-red-600">{state.error}</p>}
      {state.ok && (
        <p className="mt-2 text-xs text-brand-text">
          Fixtures created. They are on the schedule now.
        </p>
      )}
    </form>
  );
}
