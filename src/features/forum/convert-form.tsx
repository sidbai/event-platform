"use client";

import { useActionState, useState } from "react";

import type { ForumResult } from "./constants";

type Kind = { slug: string; label: string };
type Action = (prev: ForumResult, formData: FormData) => Promise<ForumResult>;

const field =
  "w-full rounded-md border border-line bg-card px-3 py-2 text-sm";
const label = "block text-sm font-medium";

export function ConvertForm({
  action,
  kinds,
  defaultTitle,
}: {
  action: Action;
  kinds: Kind[];
  defaultTitle: string;
}) {
  const [state, formAction, pending] = useActionState<ForumResult, FormData>(
    action,
    {},
  );
  const [locationType, setLocationType] = useState("in_person");
  const err = state.fieldErrors ?? {};

  return (
    <form action={formAction} className="mt-6 space-y-5">
      <div>
        <label className={label} htmlFor="title">
          Event name
        </label>
        <input
          id="title"
          name="title"
          defaultValue={defaultTitle}
          className={`mt-1 ${field}`}
        />
        {err.title && <p className="mt-1 text-xs text-red-600">{err.title}</p>}
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
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
          <label className={label} htmlFor="date">
            Date
          </label>
          <input id="date" name="date" type="date" className={`mt-1 ${field}`} />
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
        <div className="mt-1 flex gap-4 text-sm">
          <label className="flex items-center gap-1.5">
            <input
              type="radio"
              name="locationType"
              value="in_person"
              checked={locationType === "in_person"}
              onChange={() => setLocationType("in_person")}
            />
            In person
          </label>
          <label className="flex items-center gap-1.5">
            <input
              type="radio"
              name="locationType"
              value="online"
              checked={locationType === "online"}
              onChange={() => setLocationType("online")}
            />
            Online
          </label>
        </div>

        {locationType === "in_person" ? (
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            <div>
              <input
                name="venueName"
                placeholder="Venue or field name"
                className={field}
              />
              {err.venueName && (
                <p className="mt-1 text-xs text-red-600">{err.venueName}</p>
              )}
            </div>
            <input name="venueCity" placeholder="City" className={field} />
          </div>
        ) : (
          <div className="mt-2">
            <input name="onlineUrl" placeholder="https://…" className={field} />
            {err.onlineUrl && (
              <p className="mt-1 text-xs text-red-600">{err.onlineUrl}</p>
            )}
          </div>
        )}
      </fieldset>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-on-brand hover:bg-brand-strong disabled:opacity-50"
        >
          {pending ? "Creating…" : "Create the event"}
        </button>
        {state.error && <span className="text-sm text-red-600">{state.error}</span>}
      </div>
    </form>
  );
}
