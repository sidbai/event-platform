"use client";

import { useActionState, useState } from "react";

import { submitEvent, type EventFormResult } from "./actions";

type Kind = { slug: string; label: string };

const field =
  "w-full rounded-md border border-line px-3 py-2 text-sm bg-card";
const label = "block text-sm font-medium";

export function EventForm({ kinds }: { kinds: Kind[] }) {
  const [state, action, pending] = useActionState<EventFormResult, FormData>(
    (_prev, formData) => submitEvent(_prev, formData),
    {},
  );
  const [locationType, setLocationType] = useState("in_person");
  const err = state.fieldErrors ?? {};

  return (
    <form action={action} className="mt-6 space-y-5">
      <div>
        <label className={label} htmlFor="title">
          Event name
        </label>
        <input id="title" name="title" required className={`mt-1 ${field}`} />
        {err.title && <p className="mt-1 text-xs text-red-600">{err.title}</p>}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={label} htmlFor="kind">
            Kind
          </label>
          <select id="kind" name="kind" defaultValue="" className={`mt-1 ${field}`}>
            <option value="" disabled>
              Choose…
            </option>
            {kinds.map((k) => (
              <option key={k.slug} value={k.slug}>
                {k.label}
              </option>
            ))}
          </select>
          {err.kind && <p className="mt-1 text-xs text-red-600">{err.kind}</p>}
        </div>
        <div>
          <label className={label} htmlFor="format">
            Format <span className="text-muted">(optional)</span>
          </label>
          <input
            id="format"
            name="format"
            placeholder="5v5, 7v7, 11v11…"
            className={`mt-1 ${field}`}
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={label} htmlFor="date">
            Date
          </label>
          <input id="date" name="date" type="date" required className={`mt-1 ${field}`} />
          {err.date && <p className="mt-1 text-xs text-red-600">{err.date}</p>}
        </div>
        <div>
          <label className={label} htmlFor="time">
            Start time <span className="text-muted">(optional)</span>
          </label>
          <input id="time" name="time" type="time" className={`mt-1 ${field}`} />
        </div>
      </div>

      <fieldset>
        <legend className={label}>Location</legend>
        <div className="mt-2 flex gap-4 text-sm">
          {(["in_person", "online"] as const).map((t) => (
            <label key={t} className="flex items-center gap-1.5">
              <input
                type="radio"
                name="locationType"
                value={t}
                checked={locationType === t}
                onChange={() => setLocationType(t)}
              />
              {t === "in_person" ? "In person" : "Online"}
            </label>
          ))}
        </div>

        {locationType === "in_person" ? (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <input name="venueName" placeholder="Venue name" className={field} />
              {err.venueName && (
                <p className="mt-1 text-xs text-red-600">{err.venueName}</p>
              )}
            </div>
            <input name="venueAddress" placeholder="Address" className={field} />
            <input name="venueCity" placeholder="City" className={field} />
          </div>
        ) : (
          <div className="mt-3">
            <input
              name="onlineUrl"
              type="url"
              placeholder="https://…"
              className={field}
            />
            {err.onlineUrl && (
              <p className="mt-1 text-xs text-red-600">{err.onlineUrl}</p>
            )}
          </div>
        )}
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label className={label} htmlFor="ageGroup">
            Age group
          </label>
          <input id="ageGroup" name="ageGroup" placeholder="U11" className={`mt-1 ${field}`} />
        </div>
        <div>
          <label className={label} htmlFor="gender">
            Gender
          </label>
          <select id="gender" name="gender" defaultValue="" className={`mt-1 ${field}`}>
            <option value="">Any / coed</option>
            <option value="boys">Boys</option>
            <option value="girls">Girls</option>
            <option value="coed">Coed</option>
          </select>
        </div>
        <div>
          <label className={label} htmlFor="level">
            Level
          </label>
          <input id="level" name="level" placeholder="Rec, select…" className={`mt-1 ${field}`} />
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="needsOpponent" />
        We&rsquo;re looking for an opponent
      </label>

      <div>
        <label className={label} htmlFor="summary">
          Details <span className="text-muted">(optional)</span>
        </label>
        <textarea id="summary" name="summary" rows={3} className={`mt-1 ${field}`} />
      </div>

      {state.error && <p className="text-sm text-red-600">{state.error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-strong disabled:opacity-50"
      >
        {pending ? "Submitting…" : "Submit event"}
      </button>
      <p className="text-xs text-muted">
        Submitted events are reviewed before they appear in the public list.
      </p>
    </form>
  );
}
