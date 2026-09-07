"use client";

import { useActionState, useState } from "react";

import { submitEvent, updateEvent, type EventFormResult } from "./actions";

type Kind = { slug: string; label: string };

/**
 * An event's current values, for editing one that already exists.
 *
 * Dates arrive already split and already in the event's own timezone: the
 * browser must not be the one deciding what day a 9am kickoff in Seattle
 * falls on for a reader in Taipei.
 */
export type EventDefaults = {
  slug: string;
  kind: string;
  title: string;
  summary: string;
  date: string;
  time: string;
  endDate: string;
  locationType: string;
  onlineUrl: string;
  venueName: string;
  venueAddress: string;
  venueCity: string;
  ageGroup: string;
  gender: string;
  level: string;
  format: string;
  needsOpponent: boolean;
  listed: boolean;
  sourceName: string;
  sourceUrl: string;
  scheduleUrl: string;
  timezone: string;
};

const field =
  "w-full rounded-md border border-line px-3 py-2 text-sm bg-card";
const label = "block text-sm font-medium";

export function EventForm({
  kinds,
  hostTeam,
  defaultListing = false,
  initial,
}: {
  kinds: Kind[];
  hostTeam?: { slug: string; name: string } | null;
  /** Preselected when arriving from the old "list someone else's" link. */
  defaultListing?: boolean;
  /** Present when editing an event that already exists. */
  initial?: EventDefaults;
}) {
  const editing = initial !== undefined;
  const [state, action, pending] = useActionState<EventFormResult, FormData>(
    (_prev, formData) =>
      initial ? updateEvent(initial.slug, _prev, formData) : submitEvent(_prev, formData),
    {},
  );
  const [locationType, setLocationType] = useState(
    initial?.locationType ?? "in_person",
  );
  const [listed, setListed] = useState(initial?.listed ?? defaultListing);
  // A team event is usually internal, so start it private rather than
  // announcing training to the whole site by accident.
  const [visibility, setVisibility] = useState(hostTeam ? "private" : "public");
  const err = state.fieldErrors ?? {};

  return (
    <form action={action} className="mt-6 space-y-5">
      {hostTeam && <input type="hidden" name="hostTeam" value={hostTeam.slug} />}
      {initial && <input type="hidden" name="timezone" value={initial.timezone} />}
      {/* Whose event it is cannot be edited — turning a listing into one we
          run rewrites what the page offers and who owns it, which is claiming
          rather than a field. Sent along so the form still parses. */}
      {editing && (
        <input type="hidden" name="runBy" value={listed ? "someone-else" : "me"} />
      )}

      {/*
        Asked first, because it changes what the rest of the form is for.
        Running it here means this platform takes the entries, keeps the
        rosters and publishes the table; listing means pointing at somebody
        else's page so families can find it. One form either way — the
        difference is four fields, not a second way to make an event.
      */}
      <fieldset className={editing ? "hidden" : ""}>
        <legend className={label}>Who runs this event?</legend>
        <div className="mt-2 flex flex-wrap gap-4 text-sm">
          {(
            [
              ["me", "I do", "Entries, rosters and results live here."],
              [
                "someone-else",
                "Someone else",
                "A listing, so people can find it. Entries stay on their page.",
              ],
            ] as const
          ).map(([value, title, hint]) => (
            <label key={value} className="flex max-w-xs items-start gap-2">
              <input
                type="radio"
                name="runBy"
                value={value}
                defaultChecked={listed ? value === "someone-else" : value === "me"}
                onChange={() => setListed(value === "someone-else")}
                className="mt-1"
              />
              <span>
                <span className="font-medium">{title}</span>
                <span className="block text-xs text-muted">{hint}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <div>
        <label className={label} htmlFor="title">
          Event name
        </label>
        <input
          id="title"
          name="title"
          required
          defaultValue={initial?.title}
          className={`mt-1 ${field}`}
        />
        {err.title && <p className="mt-1 text-xs text-red-600">{err.title}</p>}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={label} htmlFor="kind">
            Kind
          </label>
          <select
            id="kind"
            name="kind"
            defaultValue={initial?.kind ?? ""}
            className={`mt-1 ${field}`}
          >
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
            defaultValue={initial?.format}
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
          <input
            id="date"
            name="date"
            type="date"
            required
            defaultValue={initial?.date}
            className={`mt-1 ${field}`}
          />
          {err.date && <p className="mt-1 text-xs text-red-600">{err.date}</p>}
        </div>
        <div>
          <label className={label} htmlFor="time">
            Start time <span className="text-muted">(optional)</span>
          </label>
          <input
            id="time"
            name="time"
            type="time"
            defaultValue={initial?.time}
            className={`mt-1 ${field}`}
          />
        </div>
      </div>

      <div>
        <label className={label} htmlFor="endDate">
          Last day <span className="text-muted">(optional)</span>
        </label>
        <input
          id="endDate"
          name="endDate"
          type="date"
          defaultValue={initial?.endDate}
          className={`mt-1 ${field}`}
        />
        <p className="mt-1 text-xs text-muted">
          A tournament runs for a few days and a league for a season. Leave it
          empty for something that happens once.
        </p>
        {err.endDate && <p className="mt-1 text-xs text-red-600">{err.endDate}</p>}
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
              <input
                name="venueName"
                defaultValue={initial?.venueName}
                placeholder="Venue name"
                className={field}
              />
              {err.venueName && (
                <p className="mt-1 text-xs text-red-600">{err.venueName}</p>
              )}
            </div>
            <input
              name="venueAddress"
              defaultValue={initial?.venueAddress}
              placeholder="Address"
              className={field}
            />
            <input
              name="venueCity"
              defaultValue={initial?.venueCity}
              placeholder="City"
              className={field}
            />
          </div>
        ) : (
          <div className="mt-3">
            <input
              name="onlineUrl"
              type="url"
              defaultValue={initial?.onlineUrl}
              placeholder="https://…"
              className={field}
            />
            {err.onlineUrl && (
              <p className="mt-1 text-xs text-red-600">{err.onlineUrl}</p>
            )}
          </div>
        )}
      </fieldset>

      {listed && (
        <fieldset className="rounded-lg border border-line p-4">
          <legend className="px-1 text-sm font-medium">Whose event is it?</legend>
          <p className="text-xs text-muted">
            Shown on the listing, with a link back to them. Entries, rosters
            and results stay with them.
          </p>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <div>
              <label className={label} htmlFor="sourceName">
                Organizer
              </label>
              <input
                id="sourceName"
                name="sourceName"
                defaultValue={initial?.sourceName}
                placeholder="Starfire Sports"
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
                defaultValue={initial?.sourceUrl}
                placeholder="https://…"
                className={`mt-1 ${field}`}
              />
              {err.sourceUrl && (
                <p className="mt-1 text-xs text-red-600">{err.sourceUrl}</p>
              )}
            </div>
          </div>

          <div className="mt-4">
            <label className={label} htmlFor="scheduleUrl">
              Schedule &amp; standings <span className="text-muted">(optional)</span>
            </label>
            <input
              id="scheduleUrl"
              name="scheduleUrl"
              type="url"
              defaultValue={initial?.scheduleUrl}
              placeholder="https://…"
              className={`mt-1 ${field}`}
            />
            <p className="mt-1 text-xs text-muted">
              Straight to the fixtures if they publish them separately — often
              GotSport or a similar system. It is what most people open a
              listing for, so it gets its own button.
            </p>
            {err.scheduleUrl && (
              <p className="mt-1 text-xs text-red-600">{err.scheduleUrl}</p>
            )}
          </div>
        </fieldset>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label className={label} htmlFor="ageGroup">
            Age group
          </label>
          <input
            id="ageGroup"
            name="ageGroup"
            defaultValue={initial?.ageGroup}
            placeholder="U11"
            className={`mt-1 ${field}`}
          />
        </div>
        <div>
          <label className={label} htmlFor="gender">
            Gender
          </label>
          <select
            id="gender"
            name="gender"
            defaultValue={initial?.gender ?? ""}
            className={`mt-1 ${field}`}
          >
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
          <input
            id="level"
            name="level"
            defaultValue={initial?.level}
            placeholder="Rec, select…"
            className={`mt-1 ${field}`}
          />
        </div>
      </div>

      <label className={`flex items-center gap-2 text-sm ${listed ? "hidden" : ""}`}>
        <input
          type="checkbox"
          name="needsOpponent"
          defaultChecked={initial?.needsOpponent}
        />
        We&rsquo;re looking for an opponent
      </label>

      <div>
        <label className={label} htmlFor="summary">
          Details <span className="text-muted">(optional)</span>
        </label>
        <textarea
          id="summary"
          name="summary"
          rows={3}
          defaultValue={initial?.summary}
          className={`mt-1 ${field}`}
        />
      </div>

      {/* A listing is always public: it exists to be found, and offering to
          hide one would be offering to keep somebody else's tournament
          secret. */}
      <fieldset className={listed || editing ? "hidden" : ""}>
        <legend className={label}>Who can see it</legend>
        <div className="mt-2 space-y-2 text-sm">
          <label className="flex items-start gap-2">
            <input
              type="radio"
              name="visibility"
              value="public"
              checked={visibility === "public"}
              onChange={() => setVisibility("public")}
              className="mt-1"
            />
            <span>
              <span className="font-medium">Public</span>
              <span className="block text-muted">
                Listed on the events page for anyone to find.
              </span>
            </span>
          </label>
          <label className="flex items-start gap-2">
            <input
              type="radio"
              name="visibility"
              value="unlisted"
              checked={visibility === "unlisted"}
              onChange={() => setVisibility("unlisted")}
              className="mt-1"
            />
            <span>
              <span className="font-medium">Unlisted</span>
              <span className="block text-muted">
                Not listed, but anyone with the link can open it.
              </span>
            </span>
          </label>
          <label className="flex items-start gap-2">
            <input
              type="radio"
              name="visibility"
              value="private"
              checked={visibility === "private"}
              onChange={() => setVisibility("private")}
              className="mt-1"
            />
            <span>
              <span className="font-medium">Private</span>
              <span className="block text-muted">
                Only you and the people you invite. You can invite them once
                it&rsquo;s created.
              </span>
            </span>
          </label>
        </div>
      </fieldset>

      {state.error && <p className="text-sm text-red-600">{state.error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-on-brand hover:bg-brand-strong disabled:opacity-50"
      >
        {pending
          ? editing
            ? "Saving…"
            : "Submitting…"
          : editing
            ? "Save changes"
            : "Submit event"}
      </button>
      <p className="text-xs text-muted">
        {editing
          ? "Editing does not send the event back for review, and its link stays the same."
          : "Submitted events are reviewed before they appear in the public list."}
      </p>
    </form>
  );
}
