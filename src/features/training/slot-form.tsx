"use client";

import { useActionState } from "react";

import type { ActionResult } from "./actions";

type Action = (prev: ActionResult, formData: FormData) => Promise<ActionResult>;

const field =
  "w-full rounded-md border border-line bg-card px-3 py-2 text-sm";

/**
 * One slot, as a coach thinks about it: a day, a start, an end, a place.
 *
 * The date is a date field and the times are time fields, so a phone gives
 * the coach its own pickers rather than a text box to type "2:30" into. The
 * form posts local values and the action turns them into instants in the
 * zone, because nobody entering Sunday afternoon is thinking in UTC.
 *
 * Errors sit under the field they are about. A coach adding six slots in a
 * row should be told "it has to end after it starts" beside the end time,
 * not in a red line at the bottom they have to map back.
 */
export function SlotForm({ action, date }: { action: Action; date: string }) {
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(action, {});
  const err = (k: string) =>
    state.fieldErrors?.[k] ? <p className="text-xs text-red-600">{state.fieldErrors[k]}</p> : null;

  if (state.ok) {
    return (
      <p className="rounded-md border border-line bg-elevated px-3 py-2 text-sm text-muted">
        Added. It is on your week and on the training page now.
      </p>
    );
  }

  return (
    <form action={formAction} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block text-sm">
          <span className="text-muted">Day</span>
          <input name="date" type="date" required defaultValue={date} className={field} />
          {err("startsAt")}
        </label>
        <label className="block text-sm">
          <span className="text-muted">Starts</span>
          <input name="start" type="time" required step={300} className={field} />
        </label>
        <label className="block text-sm">
          <span className="text-muted">Ends</span>
          <input name="end" type="time" required step={300} className={field} />
          {err("endsAt")}
        </label>
      </div>

      <label className="block text-sm">
        <span className="text-muted">Where</span>
        <input
          name="location"
          required
          maxLength={200}
          placeholder="Evergreen Playfield, north end"
          className={field}
        />
        {err("location")}
      </label>

      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block text-sm">
          <span className="text-muted">Players</span>
          <input name="capacity" type="number" min={1} max={30} defaultValue={1} className={field} />
          <span className="text-xs text-muted">1 is a private session.</span>
          {err("capacity")}
        </label>
        <label className="block text-sm">
          <span className="text-muted">Born from</span>
          <input name="birthYearFrom" type="number" min={1990} max={2030} placeholder="2015" className={field} />
        </label>
        <label className="block text-sm">
          <span className="text-muted">to</span>
          <input name="birthYearTo" type="number" min={1990} max={2030} placeholder="2017" className={field} />
          {err("birthYears")}
        </label>
      </div>

      <label className="block text-sm">
        <span className="text-muted">What it is</span>
        <input name="notes" maxLength={600} placeholder="Finishing · GK basics · 1v1 moves" className={field} />
        {err("notes")}
      </label>

      <button
        disabled={pending}
        className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-on-brand hover:bg-brand-strong disabled:opacity-50"
      >
        {pending ? "Adding…" : "Add this slot"}
      </button>
      {state.error && <p className="text-xs text-red-600">{state.error}</p>}
    </form>
  );
}

/** The one-time "what should parents call you" — shown until it is set. */
export function CoachNameForm({
  action,
  name,
  blurb,
}: {
  action: Action;
  name: string | null;
  blurb: string | null;
}) {
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(action, {});
  const err = (k: string) =>
    state.fieldErrors?.[k] ? <p className="text-xs text-red-600">{state.fieldErrors[k]}</p> : null;

  return (
    <form action={formAction} className="space-y-3">
      <label className="block text-sm">
        <span className="text-muted">How parents should know you</span>
        <input
          name="name"
          required
          maxLength={60}
          defaultValue={name ?? ""}
          placeholder="EJ — EJ Futball Training"
          className={field}
        />
        {err("name")}
      </label>
      <label className="block text-sm">
        <span className="text-muted">A line about what you coach (optional)</span>
        <textarea
          name="blurb"
          rows={2}
          maxLength={600}
          defaultValue={blurb ?? ""}
          placeholder="Crossfire Premier coach since 2023. 1-on-1s and small groups, Seattle north end."
          className={field}
        />
        {err("blurb")}
      </label>
      <button
        disabled={pending}
        className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-on-brand hover:bg-brand-strong disabled:opacity-50"
      >
        {pending ? "Saving…" : name ? "Save" : "Start coaching here"}
      </button>
      {state.ok && <p className="text-xs text-muted">Saved.</p>}
      {state.error && <p className="text-xs text-red-600">{state.error}</p>}
    </form>
  );
}
