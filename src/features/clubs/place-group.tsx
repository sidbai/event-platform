"use client";

import { useActionState, useId, useState } from "react";

import { confirmClubLink, markIndependent, type LinkResult } from "./link-actions";

/**
 * Placing a whole group of unmatched teams in one decision.
 *
 * The queue's other button confirms a club the matcher already proposed. This
 * one has no proposal to confirm — nothing in the directory matches these
 * names — so the club has to be chosen, and choosing it is the whole point of
 * the row: the alias it saves is what stops the next sync asking again.
 */
export function PlaceGroup({
  clubs,
  groupKey,
  label,
  teamIds,
}: {
  clubs: { id: string; name: string }[];
  groupKey: string;
  label: string;
  teamIds: string[];
}) {
  const [clubId, setClubId] = useState("");
  const selectId = useId();

  const [state, formAction, pending] = useActionState<LinkResult>(async () => {
    if (!clubId) return { error: "Pick a club first." };
    return confirmClubLink(clubId, groupKey, teamIds);
  }, {});

  const [independent, markAction, marking] = useActionState<LinkResult>(
    async () => markIndependent(teamIds),
    {},
  );

  const done = state.detail ?? independent.detail;
  if (done) return <p className="text-xs text-muted">{done}</p>;

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <label htmlFor={selectId} className="sr-only">
        The club {label} belongs to
      </label>
      <select
        id={selectId}
        value={clubId}
        onChange={(e) => setClubId(e.target.value)}
        className="rounded-md border border-line bg-surface px-2 py-1 text-xs"
      >
        <option value="">Which club?</option>
        {clubs.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>

      <form action={formAction} className="inline">
        <button
          disabled={pending || marking}
          className="rounded-md border border-line px-2.5 py-1 text-xs hover:bg-elevated disabled:opacity-50"
        >
          {pending ? "Saving…" : `File ${teamIds.length}`}
        </button>
      </form>

      <form action={markAction} className="inline">
        <button
          disabled={pending || marking}
          className="text-xs text-muted underline hover:text-ink disabled:opacity-50"
        >
          {marking ? "Saving…" : "not with a club"}
        </button>
      </form>

      {(state.error ?? independent.error) && (
        <p className="w-full text-xs text-red-600">{state.error ?? independent.error}</p>
      )}
    </div>
  );
}
