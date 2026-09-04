"use client";

import { useActionState } from "react";

import type { ScoreResult } from "./score-actions";

type Team = { id: string; name: string };
type Action = (prev: ScoreResult, formData: FormData) => Promise<ScoreResult>;

const num =
  "w-12 rounded-md border border-line px-1.5 py-1 text-center text-sm tabular-nums bg-card";
const sel =
  "rounded-md border border-line px-1.5 py-1 text-sm bg-card";

export function MatchScoreRow({
  action,
  deleteAction,
  meta,
  home,
  away,
  homePlaceholder,
  awayPlaceholder,
  homeScore,
  awayScore,
  status,
  divisionTeams,
}: {
  action: Action;
  deleteAction: () => Promise<void>;
  meta: string;
  home: Team | null;
  away: Team | null;
  homePlaceholder: string | null;
  awayPlaceholder: string | null;
  homeScore: number | null;
  awayScore: number | null;
  status: string;
  divisionTeams: Team[];
}) {
  const [state, formAction, pending] = useActionState<ScoreResult, FormData>(
    action,
    {},
  );

  const teamCell = (
    side: "home" | "away",
    team: Team | null,
    placeholder: string | null,
  ) =>
    team ? (
      <span className="truncate">{team.name}</span>
    ) : (
      <select
        name={`${side}TeamId`}
        defaultValue=""
        className={`${sel} max-w-[9rem] truncate`}
        aria-label={`${side} team`}
      >
        <option value="">{placeholder ?? "TBD"}</option>
        {divisionTeams.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>
    );

  return (
    <form
      action={formAction}
      className="flex flex-wrap items-center gap-2 border-b border-line py-2 text-sm"
    >
      <span className="w-40 shrink-0 text-xs uppercase tracking-wide text-muted">
        {meta}
      </span>

      <span className="flex flex-1 items-center justify-end gap-2 text-right">
        {teamCell("home", home, homePlaceholder)}
      </span>
      <input
        name="homeScore"
        inputMode="numeric"
        defaultValue={homeScore ?? ""}
        className={num}
        aria-label="home score"
      />
      <span className="text-muted">–</span>
      <input
        name="awayScore"
        inputMode="numeric"
        defaultValue={awayScore ?? ""}
        className={num}
        aria-label="away score"
      />
      <span className="flex flex-1 items-center gap-2">
        {teamCell("away", away, awayPlaceholder)}
      </span>

      <select name="status" defaultValue={status} className={sel} aria-label="status">
        <option value="scheduled">scheduled</option>
        <option value="live">live</option>
        <option value="final">final</option>
      </select>

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-brand px-2.5 py-1 text-xs font-semibold text-on-brand hover:bg-brand-strong disabled:opacity-50"
      >
        {pending ? "…" : "Save"}
      </button>
      <button
        type="submit"
        formAction={deleteAction}
        className="text-xs text-muted hover:text-red-600"
        aria-label="delete match"
      >
        ×
      </button>

      {state.error && (
        <span className="w-full text-xs text-red-600">{state.error}</span>
      )}
      {state.ok && (
        <span className="w-full text-xs text-brand-text">Saved.</span>
      )}
    </form>
  );
}
