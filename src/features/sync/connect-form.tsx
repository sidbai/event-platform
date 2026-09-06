"use client";

import { useActionState } from "react";

import type { ConnectResult } from "./actions";

type Action = (prev: ConnectResult, formData: FormData) => Promise<ConnectResult>;

/**
 * Paste the platform's own link for an event.
 *
 * A client component so the answer has somewhere to go: connecting is a fetch
 * of somebody else's server, and it can be refused, unreachable or simply not
 * a site we can read — each of which has to say so rather than appear to do
 * nothing.
 */
export function ConnectForm({
  action,
  eventId,
  current,
}: {
  action: Action;
  eventId: string;
  current: string | null;
}) {
  const [state, formAction, pending] = useActionState<ConnectResult, FormData>(action, {});

  return (
    <form action={formAction} className="mt-2 flex flex-wrap items-center gap-2">
      <input type="hidden" name="eventId" value={eventId} />
      <input
        name="url"
        type="url"
        required
        defaultValue={current ?? ""}
        placeholder="https://club.athletes2events.com/events/130/groups"
        className="min-w-0 flex-1 rounded-md border border-line bg-card px-2 py-1.5 text-sm"
      />
      <button
        disabled={pending}
        className="rounded-md bg-brand px-3 py-1.5 text-sm font-semibold text-on-brand hover:bg-brand-strong disabled:opacity-50"
      >
        {pending ? "Reading…" : "Connect"}
      </button>
      {state.error && <p className="w-full text-xs text-red-600">{state.error}</p>}
      {state.detail && <p className="w-full text-xs text-muted">{state.detail}</p>}
    </form>
  );
}

/** Read a connected event now, whatever its cadence says. */
export function RefreshButton({ action, eventId }: { action: Action; eventId: string }) {
  const [state, formAction, pending] = useActionState<ConnectResult, FormData>(action, {});

  return (
    <form action={formAction} className="mt-2">
      <input type="hidden" name="eventId" value={eventId} />
      <button
        disabled={pending}
        className="rounded-md border border-line px-2.5 py-1 text-xs hover:bg-elevated disabled:opacity-50"
      >
        {pending ? "Reading…" : "Refresh now"}
      </button>
      {state.error && <p className="mt-1 text-xs text-red-600">{state.error}</p>}
      {state.detail && <p className="mt-1 text-xs text-muted">{state.detail}</p>}
    </form>
  );
}

/**
 * Paste a schedule copied out of the platform's own page.
 *
 * A textarea rather than a file upload: what a person has after selecting a
 * table in their browser is a clipboard, and asking them to save it as a file
 * first is a step that loses most people.
 */
export function PasteForm({ action, eventId }: { action: Action; eventId: string }) {
  const [state, formAction, pending] = useActionState<ConnectResult, FormData>(action, {});

  return (
    <details className="mt-2">
      <summary className="cursor-pointer text-xs text-muted hover:text-ink">
        Paste a schedule instead
      </summary>
      <form action={formAction} className="mt-2 space-y-2">
        <input type="hidden" name="eventId" value={eventId} />
        <input
          name="division"
          placeholder="Division, for rows that don't say (e.g. Boys U12)"
          className="w-full rounded-md border border-line bg-card px-2 py-1.5 text-sm"
        />
        <textarea
          name="schedule"
          required
          rows={6}
          placeholder={"Select the schedule table on the platform's page, copy, and paste here.\nDate headings are used for the rows under them."}
          className="w-full rounded-md border border-line bg-card px-2 py-1.5 font-mono text-xs"
        />
        <button
          disabled={pending}
          className="rounded-md border border-line px-2.5 py-1 text-xs hover:bg-elevated disabled:opacity-50"
        >
          {pending ? "Reading…" : "Import"}
        </button>
        {state.error && <p className="text-xs text-red-600">{state.error}</p>}
        {state.detail && <p className="text-xs text-muted">{state.detail}</p>}
      </form>
    </details>
  );
}
