"use client";

import { useState, useTransition } from "react";

import { TeamCard, type Card } from "./team-card";
import type { MergeActionResult } from "./merge-actions";

/**
 * Choosing several teams from a list and folding them into one.
 *
 * The duplicate queue answers "are these two the same side" one pair at a
 * time, carefully, because it is guessing. This is the other case: somebody
 * looked at a search for a club and can see that five rows are one team. Five
 * pairs is four merges and four decisions about which survives, and the
 * answer to all of them is the same.
 *
 * The first one picked is the one kept, and the number in the corner is how
 * that is said. An order that has to be remembered rather than shown is an
 * order somebody gets wrong once and cannot see they got wrong.
 *
 * Selecting is a mode rather than a modifier key: the rows are links the rest
 * of the time, and a list where clicking sometimes navigates and sometimes
 * selects is a list nobody trusts.
 */
export function MergePicker({
  teams,
  merge,
}: {
  teams: Card[];
  merge: (survivorId: string, loserIds: string[]) => Promise<MergeActionResult>;
}) {
  const [picking, setPicking] = useState(false);
  const [order, setOrder] = useState<string[]>([]);
  const [said, setSaid] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const byId = new Map(teams.map((t) => [t.id, t]));
  const keeping = order[0] ? byId.get(order[0]) : null;

  function toggle(id: string) {
    setOrder((was) => (was.includes(id) ? was.filter((x) => x !== id) : [...was, id]));
  }

  function stop() {
    setPicking(false);
    setOrder([]);
  }

  return (
    <div className="mt-4">
      {/*
        The list is the page. Everything here is an addition to it, and the
        first version made that a mode — off, it rendered the button and
        nothing else, so an admin opening /teams saw no teams at all. Whatever
        this is doing, the teams are on screen.
      */}
      {!picking ? (
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setPicking(true)}
            className="rounded-md border border-line px-2.5 py-1 text-xs hover:bg-elevated"
          >
            Select teams to merge
          </button>
          {said && <span className="text-xs text-muted">{said}</span>}
        </div>
      ) : (
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-brand/30 bg-brand/5 px-3 py-2 text-sm">
        {order.length === 0 ? (
          <span className="text-muted">
            Pick the team to keep first, then the ones to fold into it.
          </span>
        ) : (
          <span>
            Keeping <span className="font-medium">{keeping?.name}</span>
            {order.length > 1 && (
              <>
                {" "}
                &middot; folding in {order.length - 1} other
                {order.length - 1 === 1 ? "" : "s"}
              </>
            )}
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            disabled={order.length < 2 || pending}
            onClick={() =>
              start(async () => {
                const [survivor, ...losers] = order;
                const out = await merge(survivor, losers);
                setSaid(out.error ?? out.detail ?? null);
                if (!out.error) stop();
              })
            }
            className="rounded-md bg-brand px-2.5 py-1 text-xs font-semibold text-on-brand hover:bg-brand-strong disabled:opacity-50"
          >
            {pending ? "Merging…" : `Merge ${Math.max(order.length - 1, 0)} in`}
          </button>
          <button
            type="button"
            onClick={stop}
            className="text-xs text-muted underline hover:text-ink"
          >
            Cancel
          </button>
        </div>
      </div>

      )}

      {picking && said && <p className="mt-2 text-xs text-muted">{said}</p>}

      <ul className="mt-3 grid gap-2 sm:grid-cols-2">
        {teams.map((team) => {
          const at = order.indexOf(team.id);
          // Not picking: the row somebody came here to click.
          if (!picking) return <TeamCard key={team.id} team={team} />;
          return (
            <li key={team.id} className="relative">
              {/*
                The card is still drawn by the same component, with the
                pointer taken off it — so a picked row and an unpicked one are
                the row people already know, and only the ring and the number
                are new.
              */}
              <button
                type="button"
                onClick={() => toggle(team.id)}
                aria-pressed={at >= 0}
                className={`block w-full rounded-lg text-left ${
                  at === 0
                    ? "ring-2 ring-brand"
                    : at > 0
                      ? "ring-2 ring-brand/40"
                      : "ring-0"
                }`}
              >
                <div className="pointer-events-none">
                  <ul>
                    <TeamCard team={team} />
                  </ul>
                </div>
              </button>
              {at >= 0 && (
                <span
                  className={`absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-semibold ${
                    at === 0 ? "bg-brand text-on-brand" : "bg-elevated text-ink"
                  }`}
                  title={at === 0 ? "Kept" : `Folded in (${at + 1})`}
                >
                  {at + 1}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
