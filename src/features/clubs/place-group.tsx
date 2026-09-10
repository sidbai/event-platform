"use client";

import { useActionState, useId, useState } from "react";

import {
  confirmClubLink,
  createClubAndLink,
  markIndependent,
  type LinkResult,
} from "./link-actions";

const NEW_CLUB = "__new__";

/**
 * Placing a whole group of unmatched teams in one decision.
 *
 * The queue's other button confirms a club the matcher already proposed. This
 * one has no proposal to confirm — nothing in the directory matches these
 * names — so the club has to be chosen, and choosing it is the whole point of
 * the row: the alias it saves is what stops the next sync asking again.
 *
 * For most of these groups the club is not in the directory at all, which is
 * why they are here. So the picker's last option adds it, prefilled from the
 * group's own heading, which is where the club's name already is.
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
  const [choice, setChoice] = useState("");
  const [name, setName] = useState(label);
  const selectId = useId();
  const nameId = useId();
  const creating = choice === NEW_CLUB;

  const [state, formAction, pending] = useActionState<LinkResult, FormData>(
    async (prev, formData) => {
      if (creating) return createClubAndLink(groupKey, teamIds, prev, formData);
      if (!choice) return { error: "Pick a club, or add the one they belong to." };
      return confirmClubLink(choice, groupKey, teamIds);
    },
    {},
  );

  const [independent, markAction, marking] = useActionState<LinkResult>(
    async () => markIndependent(teamIds),
    {},
  );

  const done = state.detail ?? independent.detail;
  if (done) return <p className="text-xs text-muted">{done}</p>;

  return (
    <form action={formAction} className="mt-2 flex flex-wrap items-center gap-2">
      <label htmlFor={selectId} className="sr-only">
        The club {label} belongs to
      </label>
      <select
        id={selectId}
        value={choice}
        onChange={(e) => setChoice(e.target.value)}
        className="rounded-md border border-line bg-surface px-2 py-1 text-xs"
      >
        <option value="">Which club?</option>
        {clubs.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
        <option value={NEW_CLUB}>+ Add a club not in the list</option>
      </select>

      {creating && (
        <>
          <label htmlFor={nameId} className="sr-only">
            The new club&rsquo;s name
          </label>
          <input
            id={nameId}
            name="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Club name"
            className="rounded-md border border-line bg-surface px-2 py-1 text-xs"
          />
        </>
      )}

      <button
        disabled={pending || marking}
        className="rounded-md border border-line px-2.5 py-1 text-xs hover:bg-elevated disabled:opacity-50"
      >
        {pending
          ? "Saving…"
          : creating
            ? `Add and file ${teamIds.length}`
            : `File ${teamIds.length}`}
      </button>

      <button
        type="button"
        disabled={pending || marking}
        onClick={() => markAction()}
        className="text-xs text-muted underline hover:text-ink disabled:opacity-50"
      >
        {marking ? "Saving…" : "not with a club"}
      </button>

      {(state.error ?? independent.error) && (
        <p className="w-full text-xs text-red-600">
          {state.error ?? independent.error}
        </p>
      )}
    </form>
  );
}
