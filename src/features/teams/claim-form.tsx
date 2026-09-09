"use client";

import { useActionState } from "react";

import type { ClaimResult } from "./claim-actions";

/** requestTeamClaim, with its slug already bound by the server component. */
type Action = (prev: ClaimResult, formData: FormData) => Promise<ClaimResult>;

/**
 * "This is my team", folded away until somebody wants it.
 *
 * A details element rather than a button: on a team page the reader is
 * usually a parent looking up a kick-off time, and the one person who runs
 * the team is looking for it. It asks for a sentence, because with nothing to
 * verify against that sentence is the whole of what an admin decides on.
 */
export function ClaimTeamForm({ action }: { action: Action }) {
  const [state, formAction, pending] = useActionState<ClaimResult, FormData>(action, {});

  if (state.ok) {
    return (
      <p className="mt-4 rounded-md border border-line bg-elevated px-3 py-2 text-sm text-muted">
        Sent. An admin will look at it — nothing about the team changes until
        they do.
      </p>
    );
  }

  return (
    <details className="mt-4">
      <summary className="cursor-pointer text-sm text-brand-text hover:underline">
        Is this your team?
      </summary>
      <form action={formAction} className="mt-2 space-y-2">
        <p className="text-sm text-muted">
          {/* Coach, manager, club administrator, the parent who does the
              fixtures — whoever actually runs it. Naming a role would send
              everybody else away. */}
          Say who you are and how somebody could check &mdash; your role, the
          club, and a way to reach you. An admin reads it; it is never shown on
          the team&rsquo;s page.
        </p>
        <textarea
          name="note"
          required
          rows={3}
          placeholder="I'm the team manager for Eastside FC GU12 Red — the club office can confirm it."
          className="w-full rounded-md border border-line bg-card px-3 py-2 text-sm"
        />
        {state.fieldErrors?.note && (
          <p className="text-xs text-red-600">{state.fieldErrors.note}</p>
        )}
        <button
          disabled={pending}
          className="rounded-md border border-line px-3 py-1.5 text-sm font-medium hover:bg-elevated disabled:opacity-50"
        >
          {pending ? "Sending…" : "Ask to manage this team"}
        </button>
        {state.error && <p className="text-xs text-red-600">{state.error}</p>}
      </form>
    </details>
  );
}

/**
 * A new name, as a request rather than an edit.
 *
 * Sits where the name field would be. The team keeps the name it has until
 * somebody approves this, which is the whole point: an imported name is
 * platform output and wants fixing, but a club's team is named by the club.
 */
export function ProposeNameForm({
  action,
  currentName,
  pendingName,
}: {
  action: Action;
  currentName: string;
  /** A proposal already waiting, if there is one. */
  pendingName?: string | null;
}) {
  const [state, formAction, pending] = useActionState<ClaimResult, FormData>(action, {});

  return (
    <div className="rounded-md border border-line p-3">
      <h3 className="text-sm font-medium">Team name</h3>
      <p className="mt-1 text-sm text-muted">
        Currently <span className="text-ink">{currentName}</span>. Renaming a
        club&rsquo;s team is checked by an admin first &mdash; imported names are
        whatever the tournament&rsquo;s platform published, so most of these are
        fixes. The web address never changes.
      </p>

      {pendingName && !state.ok && (
        <p className="mt-2 text-sm text-muted">
          Waiting for review: <span className="text-ink">{pendingName}</span>. Sending
          another replaces it.
        </p>
      )}

      {state.ok ? (
        <p className="mt-2 text-sm text-muted">Sent. An admin will look at it.</p>
      ) : (
        <form action={formAction} className="mt-2 flex flex-wrap gap-2">
          <input
            name="name"
            required
            defaultValue={pendingName ?? currentName}
            className="min-w-0 flex-1 rounded-md border border-line bg-card px-3 py-2 text-sm"
          />
          <button
            disabled={pending}
            className="rounded-md border border-line px-3 py-1.5 text-sm font-medium hover:bg-elevated disabled:opacity-50"
          >
            {pending ? "Sending…" : "Propose"}
          </button>
          {state.fieldErrors?.name && (
            <p className="w-full text-xs text-red-600">{state.fieldErrors.name}</p>
          )}
          {state.error && <p className="w-full text-xs text-red-600">{state.error}</p>}
        </form>
      )}
    </div>
  );
}
