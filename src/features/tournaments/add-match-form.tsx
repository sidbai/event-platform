"use client";

import { useActionState, useState } from "react";

import type { ScoreResult } from "./score-actions";

type Team = { id: string; name: string };
type Division = { id: string; name: string; label: string | null };
type Action = (prev: ScoreResult, formData: FormData) => Promise<ScoreResult>;

const field =
  "rounded-md border border-line px-2 py-1.5 text-sm bg-card";

export function AddMatchForm({
  action,
  divisions,
  teamsByDivision,
}: {
  action: Action;
  divisions: Division[];
  teamsByDivision: Record<string, Team[]>;
}) {
  const [state, formAction, pending] = useActionState<ScoreResult, FormData>(
    (prev, fd) => action(prev, fd),
    {},
  );
  const [divisionId, setDivisionId] = useState(divisions[0]?.id ?? "");
  const [round, setRound] = useState("group");
  const teams = teamsByDivision[divisionId] ?? [];

  return (
    <details className="mt-6 rounded-lg border border-dashed border-line p-3">
      <summary className="cursor-pointer text-sm font-medium">Add a match</summary>
      <form action={formAction} className="mt-3 flex flex-wrap items-end gap-2">
        <label className="text-xs">
          <span className="block text-muted">Division</span>
          <select
            name="divisionId"
            value={divisionId}
            onChange={(e) => setDivisionId(e.target.value)}
            className={`mt-0.5 ${field}`}
          >
            {divisions.map((d) => (
              <option key={d.id} value={d.id}>
                {d.label ?? d.name}
              </option>
            ))}
          </select>
        </label>

        <label className="text-xs">
          <span className="block text-muted">Round</span>
          <select
            name="round"
            value={round}
            onChange={(e) => setRound(e.target.value)}
            className={`mt-0.5 ${field}`}
          >
            <option value="group">Group</option>
            <option value="semi">Semifinal</option>
            <option value="final">Final</option>
            <option value="third">3rd place</option>
          </select>
        </label>

        {round === "group" && (
          <label className="text-xs">
            <span className="block text-muted">Group</span>
            <input name="groupLabel" placeholder="1" className={`mt-0.5 w-16 ${field}`} />
          </label>
        )}

        <label className="text-xs">
          <span className="block text-muted">Home</span>
          <select name="homeTeamId" defaultValue="" className={`mt-0.5 ${field}`}>
            <option value="">TBD</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs">
          <span className="block text-muted">Away</span>
          <select name="awayTeamId" defaultValue="" className={`mt-0.5 ${field}`}>
            <option value="">TBD</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>

        <label className="text-xs">
          <span className="block text-muted">Field</span>
          <input name="field" placeholder="Field 1" className={`mt-0.5 w-24 ${field}`} />
        </label>
        <label className="text-xs">
          <span className="block text-muted">Time</span>
          <input name="time" type="time" className={`mt-0.5 ${field}`} />
        </label>

        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-strong disabled:opacity-50"
        >
          {pending ? "Adding…" : "Add"}
        </button>
        {state.error && <span className="text-xs text-red-600">{state.error}</span>}
        {state.ok && <span className="text-xs text-brand-text">Added.</span>}
      </form>
    </details>
  );
}
