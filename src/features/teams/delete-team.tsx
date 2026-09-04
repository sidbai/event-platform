"use client";

import { useActionState } from "react";

import type { TeamFormResult } from "./actions";

/**
 * Deletion is irreversible and the action redirects on success, so the only
 * state this ever renders is the refusal explaining why a team is still tied
 * to an event.
 */
export function DeleteTeamButton({
  teamName,
  action,
}: {
  teamName: string;
  action: () => Promise<TeamFormResult>;
}) {
  const [state, formAction, pending] = useActionState<TeamFormResult, FormData>(
    async () => action(),
    {},
  );

  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (
          !window.confirm(
            `Delete ${teamName}? This removes the team, its members and any pending invites. It can't be undone.`,
          )
        ) {
          e.preventDefault();
        }
      }}
    >
      <button
        type="submit"
        disabled={pending}
        className="rounded-md border border-red-300 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
      >
        {pending ? "Deleting…" : "Delete this team"}
      </button>
      {state.error && <p className="mt-2 text-sm text-red-600">{state.error}</p>}
    </form>
  );
}
