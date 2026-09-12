"use client";

import Link from "next/link";
import { useActionState, useState } from "react";

import type { TeamHit } from "./manual-merge-actions";
import type { SplitActionResult } from "./split-actions";

type Entry = {
  eventId: string;
  divisionId: string | null;
  title: string;
  /** What that event called the side, when it differs from the team's name. */
  as: string | null;
  division: string | null;
  games: number;
  /** False for games a merge left here without an entry of their own. */
  entered: boolean;
};

/**
 * Taking some events off a team and giving them to another.
 *
 * For the admin who can see that a row is two teams — the same club's A
 * and B sides entered under one name by one tournament and two by the next.
 * Tick the events that belong to the other side, say where they go, and
 * the entries, games and results move; nothing is deleted, and merging the
 * two back is one click on the queue if it was wrong.
 *
 * Folded away by default: on a page most people open to see a score, a
 * form that reshapes the team is a thing to find, not to trip over.
 */
export function SplitPanel({
  teamSlug,
  teamName,
  entries,
  action,
  search,
}: {
  teamSlug: string;
  teamName: string;
  entries: Entry[];
  action: (prev: SplitActionResult, formData: FormData) => Promise<SplitActionResult>;
  search: (query: string) => Promise<TeamHit[]>;
}) {
  const [state, formAction, pending] = useActionState<SplitActionResult, FormData>(action, {});
  const [mode, setMode] = useState<"new" | "existing">("new");
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<TeamHit[]>([]);
  const [picked, setPicked] = useState<TeamHit | null>(null);
  const field = "rounded-md border border-line bg-card px-2 py-1 text-sm";

  async function lookUp(q: string) {
    setQuery(q);
    setPicked(null);
    setHits(q.trim().length >= 2 ? await search(q) : []);
  }

  return (
    <details className="mt-6 rounded-lg border border-dashed border-line p-3 text-sm">
      <summary className="cursor-pointer font-medium">Split this team (admin)</summary>
      <p className="mt-2 text-xs text-muted">
        Move some of these — an event, or one flight of it, with the games and results — to
        another team, or to a new one. Nothing is deleted; merging them back is one click on
        the queue.
      </p>
      <form action={formAction} className="mt-3 space-y-3">
        {entries.length === 0 && (
          <p className="text-xs text-muted">Nothing left to move — every event has gone to another team.</p>
        )}
        <ul className="space-y-1">
          {entries.map((e) => (
            <li key={`${e.eventId}:${e.divisionId ?? ""}`}>
              <label className="flex items-start gap-2">
                <input type="checkbox" name="pick" value={`${e.eventId}:${e.divisionId ?? ""}`} className="mt-1" />
                <span>
                  <span className="font-medium">{e.title}</span>
                  <span className="block text-xs text-muted">
                    {[
                      e.division,
                      e.as && `entered as ${e.as}`,
                      `${e.games} game${e.games === 1 ? "" : "s"}`,
                      !e.entered && "games only — no entry of its own, a merge left them here",
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
              </label>
            </li>
          ))}
        </ul>

        <div className="space-y-2">
          <label className="flex items-center gap-2">
            <input type="radio" name="mode" value="new" checked={mode === "new"} onChange={() => setMode("new")} />
            <span>A new team named</span>
            <input
              name="newName"
              defaultValue={`${teamName} 2`}
              disabled={mode !== "new"}
              className={`${field} min-w-0 flex-1 disabled:opacity-50`}
              aria-label="new team name"
            />
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" name="mode" value="existing" checked={mode === "existing"} onChange={() => setMode("existing")} />
            <span>An existing team</span>
            <input
              value={picked ? picked.name : query}
              onChange={(e) => void lookUp(e.target.value)}
              disabled={mode !== "existing"}
              placeholder="Search by name…"
              className={`${field} min-w-0 flex-1 disabled:opacity-50`}
              aria-label="search teams"
            />
          </label>
          <input type="hidden" name="targetTeamId" value={picked?.id ?? ""} />
          {mode === "existing" && !picked && hits.length > 0 && (
            <ul className="ml-6 divide-y divide-line rounded-md border border-line bg-card">
              {hits.map((h) => (
                <li key={h.id}>
                  <button
                    type="button"
                    onClick={() => setPicked(h)}
                    className="block w-full px-2 py-1.5 text-left hover:bg-elevated"
                  >
                    <span className="font-medium">{h.name}</span>
                    <span className="block text-xs text-muted">{h.detail}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-brand px-3 py-1.5 text-sm font-semibold text-on-brand hover:bg-brand-strong disabled:opacity-50"
          >
            {pending ? "Moving…" : "Move the ticked events"}
          </button>
          {state.error && <span className="text-red-600">{state.error}</span>}
          {state.detail && (
            <span className="text-brand-text">
              {state.detail}{" "}
              {state.target && (
                <Link href={`/teams/${state.target.slug}`} className="underline">
                  open {state.target.name}
                </Link>
              )}
            </span>
          )}
        </div>
        <p className="text-xs text-muted">
          Leaves this page as <span className="font-mono">/teams/{teamSlug}</span>; the moved events
          reappear on the other team.
        </p>
      </form>
    </details>
  );
}
