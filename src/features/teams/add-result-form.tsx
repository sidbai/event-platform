"use client";

import { useActionState, useEffect, useState } from "react";

import type { AddResultState, OpponentHit } from "./add-result-actions";

/**
 * Five fields, and no tournament to fill in first.
 *
 * A side that flew to Dallas and played five games will add none of them if
 * the first step is creating an event record. So this asks for what somebody
 * remembers — the day, who they played, the score, and what the cup was
 * called — and works out where to file it on the other side.
 */

type Action = (prev: AddResultState, form: FormData) => Promise<AddResultState>;
type Search = (q: string) => Promise<OpponentHit[]>;

const field = "rounded-md border border-line bg-card px-2 py-1.5 text-sm";

export function AddResultForm({
  action,
  search,
}: {
  action: Action;
  search: Search;
}) {
  const [state, formAction, pending] = useActionState<AddResultState, FormData>(
    (prev, fd) => action(prev, fd),
    {},
  );
  const [opponent, setOpponent] = useState("");
  const [hits, setHits] = useState<OpponentHit[]>([]);
  const [picked, setPicked] = useState<OpponentHit | null>(null);

  /*
   * Looked up as they type, and thrown away if they keep typing. Nothing is
   * decided by what comes back — the list is an offer, and only the click
   * below links anything.
   */
  const looking = !picked && opponent.trim().length >= 3;
  useEffect(() => {
    if (!looking) return;
    let live = true;
    const timer = setTimeout(() => {
      search(opponent).then((found) => {
        if (live) setHits(found);
      });
    }, 250);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [opponent, looking, search]);

  // Shown, rather than cleared in the effect: whether the list belongs on
  // screen is a fact about what is typed right now, not a thing to remember.
  const showing = looking ? hits : [];

  return (
    <details className="mt-3 rounded-lg border border-dashed border-line p-3">
      <summary className="cursor-pointer text-sm font-medium">
        Add a result we don&rsquo;t have
      </summary>
      <p className="mt-2 text-xs text-muted">
        A cup out of state, a tour abroad — anywhere our sources don&rsquo;t
        reach. It shows on this page and counts in the team&rsquo;s record,
        marked as added by the team.
      </p>

      <form action={formAction} className="mt-3 flex flex-wrap items-end gap-2">
        <label className="text-xs">
          <span className="block text-muted">Date</span>
          <input type="date" name="playedOn" required className={field} />
        </label>

        <label className="relative text-xs">
          <span className="block text-muted">Opponent</span>
          <input
            name="opponent"
            required
            maxLength={80}
            placeholder="FC Dallas B12 Red"
            autoComplete="off"
            value={opponent}
            onChange={(e) => {
              setOpponent(e.target.value);
              setPicked(null);
            }}
            className={`${field} w-52`}
          />
          <input type="hidden" name="opponentTeamId" value={picked?.id ?? ""} />
          {showing.length > 0 && (
            <ul className="absolute left-0 top-full z-10 mt-1 w-72 overflow-hidden rounded-md border border-line bg-card shadow-lg">
              <li className="px-2 py-1 text-[11px] text-muted">
                Already here — pick one, or keep typing for a team we don&rsquo;t
                have
              </li>
              {showing.map((hit) => (
                <li key={hit.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setPicked(hit);
                      setOpponent(hit.name);
                      setHits([]);
                    }}
                    className="block w-full px-2 py-1.5 text-left text-sm hover:bg-elevated"
                  >
                    {hit.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </label>

        <label className="text-xs">
          <span className="block text-muted">Us</span>
          <input
            name="ourScore"
            required
            inputMode="numeric"
            className={`${field} w-14 tabular-nums`}
          />
        </label>

        <label className="text-xs">
          <span className="block text-muted">Them</span>
          <input
            name="theirScore"
            required
            inputMode="numeric"
            className={`${field} w-14 tabular-nums`}
          />
        </label>

        <label className="text-xs">
          <span className="block text-muted">Competition</span>
          <input
            name="competition"
            maxLength={80}
            placeholder="Dallas Cup"
            className={`${field} w-44`}
          />
        </label>

        <label className="flex items-center gap-1.5 pb-1.5 text-xs text-muted">
          <input type="checkbox" name="wasHome" />
          At home
        </label>

        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-brand px-3 py-1.5 text-sm text-white disabled:opacity-60"
        >
          {pending ? "Adding…" : "Add"}
        </button>
      </form>

      {picked && (
        <p className="mt-2 text-xs text-muted">
          {picked.name} has a page here, so this goes to them or an admin to
          confirm before it shows.
        </p>
      )}

      {state.error && <p className="mt-2 text-sm text-red-600">{state.error}</p>}
      {state.ok && (
        <p className="mt-2 text-sm text-brand-text">{state.note ?? "Added."}</p>
      )}
    </details>
  );
}
