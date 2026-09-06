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
