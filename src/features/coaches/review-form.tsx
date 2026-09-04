"use client";

import { useActionState } from "react";

import {
  COACH_SCALES,
  REVIEWER_ROLES,
  type Ratings,
  type ReviewResult,
} from "@/features/reviews/constants";

import { COACH_REVIEW_RULE } from "./constants";

type Action = (prev: ReviewResult, formData: FormData) => Promise<ReviewResult>;

const field = "w-full rounded-md border border-line bg-card px-3 py-2 text-sm";

export function CoachReviewForm({
  action,
  existing,
  seasons,
}: {
  action: Action;
  existing?: {
    ratings: Ratings;
    reviewerRole: string;
    title: string;
    body: string;
    teamLabel: string | null;
    season: string | null;
    yearsWith: number | null;
    recommends: boolean | null;
  } | null;
  seasons: string[];
}) {
  const [state, formAction, pending] = useActionState<ReviewResult, FormData>(
    action,
    {},
  );
  const err = state.fieldErrors ?? {};

  return (
    <form action={formAction} className="mt-6 space-y-6">
      <p className="rounded-lg border border-line bg-elevated px-4 py-3 text-sm text-muted">
        {COACH_REVIEW_RULE}
      </p>

      <fieldset>
        <legend className="text-sm font-medium">Your experience</legend>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <label className="block text-sm">
            Team
            <input
              name="teamLabel"
              defaultValue={existing?.teamLabel ?? ""}
              placeholder="e.g. Boys 2013"
              className={`mt-1 ${field}`}
            />
            {err.teamLabel && (
              <span className="text-xs text-red-600">{err.teamLabel}</span>
            )}
          </label>

          <label className="block text-sm">
            Season
            <select
              name="season"
              defaultValue={existing?.season ?? seasons[0]}
              className={`mt-1 ${field}`}
            >
              {seasons.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            {err.season && <span className="text-xs text-red-600">{err.season}</span>}
          </label>

          <label className="block text-sm">
            You were
            <select
              name="reviewerRole"
              defaultValue={existing?.reviewerRole ?? ""}
              className={`mt-1 ${field}`}
            >
              <option value="">Choose…</option>
              {REVIEWER_ROLES.map((r) => (
                <option key={r.key} value={r.key}>
                  {r.key === "parent"
                    ? "A parent of a player on their team"
                    : r.key === "player"
                      ? "A player on their team"
                      : "A coach who worked with them"}
                </option>
              ))}
            </select>
            {err.reviewerRole && (
              <span className="text-xs text-red-600">{err.reviewerRole}</span>
            )}
          </label>

          <label className="block text-sm">
            Seasons with this coach
            <input
              name="yearsWith"
              type="number"
              min={1}
              max={20}
              defaultValue={existing?.yearsWith ?? 1}
              className={`mt-1 ${field}`}
            />
            {err.yearsWith && (
              <span className="text-xs text-red-600">{err.yearsWith}</span>
            )}
          </label>
        </div>
      </fieldset>

      <fieldset>
        <legend className="text-sm font-medium">Ratings</legend>
        {err.ratings && <p className="text-xs text-red-600">{err.ratings}</p>}
        <div className="mt-3 space-y-3">
          {COACH_SCALES.map((scale) => (
            <div
              key={scale.key}
              className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3"
            >
              <div className="min-w-0">
                <div className="text-sm">{scale.label}</div>
                {"hint" in scale && scale.hint && (
                  <div className="text-xs text-muted">{scale.hint}</div>
                )}
              </div>
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map((n) => (
                  <label key={n} className="cursor-pointer">
                    <input
                      type="radio"
                      name={scale.key}
                      value={n}
                      defaultChecked={existing?.ratings[scale.key] === n}
                      className="peer sr-only"
                    />
                    <span className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-line text-sm peer-checked:border-brand peer-checked:bg-brand peer-checked:font-semibold peer-checked:text-on-brand">
                      {n}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="text-sm font-medium">
          Would you recommend this coach?
        </legend>
        <div className="mt-2 flex gap-2">
          {[
            { v: "yes", label: "👍 Yes" },
            { v: "no", label: "👎 No" },
          ].map((o) => (
            <label key={o.v} className="cursor-pointer">
              <input
                type="radio"
                name="recommends"
                value={o.v}
                defaultChecked={
                  existing?.recommends === (o.v === "yes") &&
                  existing?.recommends !== null
                }
                className="peer sr-only"
              />
              <span className="inline-flex items-center rounded-md border border-line px-3 py-1.5 text-sm peer-checked:border-brand peer-checked:bg-brand peer-checked:font-semibold peer-checked:text-on-brand">
                {o.label}
              </span>
            </label>
          ))}
        </div>
        {err.recommends && (
          <p className="mt-1 text-xs text-red-600">{err.recommends}</p>
        )}
      </fieldset>

      <div>
        <label className="block text-sm font-medium" htmlFor="title">
          Headline
        </label>
        <input
          id="title"
          name="title"
          defaultValue={existing?.title}
          className={`mt-1 ${field}`}
        />
        {err.title && <p className="mt-1 text-xs text-red-600">{err.title}</p>}
      </div>

      <div>
        <label className="block text-sm font-medium" htmlFor="body">
          What was your experience?
        </label>
        <textarea
          id="body"
          name="body"
          rows={8}
          defaultValue={existing?.body}
          placeholder="What training was like, how they communicated, how the season went."
          className={`mt-1 ${field}`}
        />
        {err.body && <p className="mt-1 text-xs text-red-600">{err.body}</p>}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-on-brand hover:bg-brand-strong disabled:opacity-50"
        >
          {pending ? "Saving…" : "Post review"}
        </button>
        <span className="text-xs text-muted">
          Posted under a pseudonym. Your name is never shown.
        </span>
        {state.error && <span className="text-sm text-red-600">{state.error}</span>}
      </div>
    </form>
  );
}
