"use client";

import { useActionState } from "react";

import type { EventFormResult } from "./actions";

const field =
  "w-full rounded-md border border-line bg-card px-3 py-2 text-sm";
const label = "text-sm font-medium";

/**
 * Listing somebody else's event.
 *
 * Deliberately shorter than the form for an event we run: no visibility, no
 * modules, no opponent-wanted. A listing is a pointer, and asking whoever is
 * typing it in for anything the organizer's page already answers is asking
 * them to copy out a website.
 */
export function ListingForm({
  action,
  kinds,
}: {
  action: (prev: EventFormResult, formData: FormData) => Promise<EventFormResult>;
  kinds: { slug: string; label: string }[];
}) {
  const [state, formAction, pending] = useActionState<EventFormResult, FormData>(
    action,
    {},
  );
  const err = state.fieldErrors ?? {};

  return (
    <form action={formAction} className="mt-6 space-y-5">
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
          <input id="format" name="format" placeholder="7v7, 11v11…" className={`mt-1 ${field}`} />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label className={label} htmlFor="date">
            First day
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
        <div>
          <label className={label} htmlFor="endDate">
            Last day <span className="text-muted">(optional)</span>
          </label>
          <input id="endDate" name="endDate" type="date" className={`mt-1 ${field}`} />
          {err.endDate && <p className="mt-1 text-xs text-red-600">{err.endDate}</p>}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={label} htmlFor="venueName">
            Where <span className="text-muted">(optional)</span>
          </label>
          <input id="venueName" name="venueName" placeholder="Starfire Sports" className={`mt-1 ${field}`} />
        </div>
        <div>
          <label className={label} htmlFor="venueCity">
            City <span className="text-muted">(optional)</span>
          </label>
          <input id="venueCity" name="venueCity" placeholder="Tukwila" className={`mt-1 ${field}`} />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={label} htmlFor="ageGroup">
            Age groups <span className="text-muted">(optional)</span>
          </label>
          <input id="ageGroup" name="ageGroup" placeholder="U9–U14" className={`mt-1 ${field}`} />
        </div>
        <div>
          <label className={label} htmlFor="gender">
            Gender <span className="text-muted">(optional)</span>
          </label>
          <input id="gender" name="gender" placeholder="Boys, Girls, Co-ed" className={`mt-1 ${field}`} />
        </div>
      </div>

      {/* The two fields that make this a listing rather than a claim about
          somebody else's event. */}
      <fieldset className="rounded-lg border border-line p-4">
        <legend className="px-1 text-sm font-medium">Whose event is this?</legend>
        <p className="text-xs text-muted">
          Shown on the listing, with a link back. Entries, rosters and results
          stay with them — this page only helps people find it.
        </p>

        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <div>
            <label className={label} htmlFor="sourceName">
              Organizer
            </label>
            <input
              id="sourceName"
              name="sourceName"
              required
              placeholder="Washington Premier League"
              className={`mt-1 ${field}`}
            />
            {err.sourceName && (
              <p className="mt-1 text-xs text-red-600">{err.sourceName}</p>
            )}
          </div>
          <div>
            <label className={label} htmlFor="sourceUrl">
              Their page
            </label>
            <input
              id="sourceUrl"
              name="sourceUrl"
              type="url"
              required
              placeholder="https://…"
              className={`mt-1 ${field}`}
            />
            {err.sourceUrl && (
              <p className="mt-1 text-xs text-red-600">{err.sourceUrl}</p>
            )}
          </div>
        </div>
      </fieldset>

      <div>
        <label className={label} htmlFor="summary">
          Summary <span className="text-muted">(optional)</span>
        </label>
        <textarea id="summary" name="summary" rows={3} className={`mt-1 ${field}`} />
      </div>

      {state.error && <p className="text-sm text-red-600">{state.error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-on-brand hover:bg-brand-strong disabled:opacity-50"
      >
        {pending ? "Listing…" : "List this event"}
      </button>
    </form>
  );
}
