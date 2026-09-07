"use client";

import { useState, useTransition } from "react";

import {
  mergeChosenTeams,
  searchTeamsToMerge,
  type ManualMergeResult,
  type TeamHit,
} from "./manual-merge-actions";

/**
 * Merging two teams somebody already knows are one.
 *
 * The queue above proposes what rules and a model can see. This is for what
 * they cannot: a coach saying two rows are the same side, a club's junior
 * programme under another name, a rebrand nobody has written down.
 *
 * Which team survives is picked, not inferred. The queue's heuristics — most
 * matches, most events — are a fair guess when nobody has looked, and beside
 * the point when somebody has.
 */
function TeamPicker({
  label,
  hint,
  chosen,
  onChoose,
}: {
  label: string;
  hint: string;
  chosen: TeamHit | null;
  onChoose: (team: TeamHit | null) => void;
}) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<TeamHit[]>([]);
  const [, startTransition] = useTransition();

  if (chosen) {
    return (
      <div className="rounded-md border border-line p-3">
        <div className="text-xs uppercase tracking-wide text-muted">{label}</div>
        <div className="mt-1 font-medium">{chosen.name}</div>
        <div className="text-xs text-muted">{chosen.detail}</div>
        <button
          type="button"
          onClick={() => {
            onChoose(null);
            setQuery("");
            setHits([]);
          }}
          className="mt-2 text-xs text-muted underline hover:text-ink"
        >
          Choose a different team
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-md border border-line p-3">
      <label className="block text-xs uppercase tracking-wide text-muted">
        {label}
        <input
          value={query}
          placeholder="Search by name"
          onChange={(e) => {
            const next = e.target.value;
            setQuery(next);
            startTransition(async () => setHits(await searchTeamsToMerge(next)));
          }}
          className="mt-1 block w-full rounded-md border border-line bg-card px-2 py-1.5 text-sm normal-case tracking-normal text-ink"
        />
      </label>
      <p className="mt-1 text-xs text-muted">{hint}</p>

      {hits.length > 0 && (
        <ul className="mt-2 max-h-56 space-y-1 overflow-y-auto">
          {hits.map((hit) => (
            <li key={hit.id}>
              <button
                type="button"
                onClick={() => onChoose(hit)}
                className="block w-full rounded px-2 py-1 text-left text-sm hover:bg-elevated"
              >
                {hit.name}
                <span className="block text-xs text-muted">{hit.detail}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function ManualMerge() {
  const [keep, setKeep] = useState<TeamHit | null>(null);
  const [fold, setFold] = useState<TeamHit | null>(null);
  const [state, setState] = useState<ManualMergeResult>({});
  const [pending, startTransition] = useTransition();

  const ready = keep && fold && keep.id !== fold.id;

  return (
    <div className="mt-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <TeamPicker
          label="Keep this team"
          hint="Its page, its address and its history stay."
          chosen={keep}
          onChoose={setKeep}
        />
        <TeamPicker
          label="Fold in this one"
          hint="Its matches move across; its old address redirects."
          chosen={fold}
          onChoose={setFold}
        />
      </div>

      {keep && fold && keep.id === fold.id && (
        <p className="mt-2 text-xs text-red-600">That is the same team twice.</p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={!ready || pending}
          onClick={() =>
            startTransition(async () => {
              if (!keep || !fold) return;
              const result = await mergeChosenTeams(keep.id, fold.id);
              setState(result);
              if (!result.error) {
                setKeep(null);
                setFold(null);
              }
            })
          }
          className="rounded-md bg-brand px-3 py-1.5 text-sm font-semibold text-on-brand hover:bg-brand-strong disabled:opacity-50"
        >
          {pending ? "Merging…" : "Merge these two"}
        </button>
        {state.error && <span className="text-sm text-red-600">{state.error}</span>}
        {state.detail && <span className="text-sm text-muted">{state.detail}</span>}
      </div>
    </div>
  );
}
