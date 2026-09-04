"use client";

import { useActionState } from "react";

import {
  RATING_CATEGORIES,
  REVIEWER_ROLES,
  type ClubResult,
} from "./constants";

type Action = (prev: ClubResult, formData: FormData) => Promise<ClubResult>;

const field = "w-full rounded-md border border-line bg-card px-3 py-2 text-sm";

/** Five radios styled as stars — keyboard and screen-reader usable, no JS state. */
function StarPicker({
  name,
  label,
  defaultValue,
  error,
}: {
  name: string;
  label: string;
  defaultValue?: number;
  error?: string;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 py-1.5">
      <span className="text-sm font-medium">{label}</span>
      <div className="flex items-center gap-3">
        <fieldset className="flex flex-row-reverse items-center gap-1 [&>label:hover~label]:text-amber-500 [&>label:hover]:text-amber-500 [&>label:has(:checked)~label]:text-amber-500 [&>label:has(:checked)]:text-amber-500">
          <legend className="sr-only">{label}</legend>
          {[5, 4, 3, 2, 1].map((n) => (
            <label
              key={n}
              className="cursor-pointer text-xl leading-none text-line transition-colors"
              title={`${n} of 5`}
            >
              <input
                type="radio"
                name={name}
                value={n}
                defaultChecked={defaultValue === n}
                className="sr-only"
              />
              <span aria-hidden>★</span>
              <span className="sr-only">
                {n} star{n > 1 ? "s" : ""}
              </span>
            </label>
          ))}
        </fieldset>
      </div>
      {error && <p className="w-full text-xs text-red-600">{error}</p>}
    </div>
  );
}

export function ReviewForm({
  action,
  existing,
}: {
  action: Action;
  existing?: {
    title: string;
    body: string;
    reviewerRole: string;
    ratings: Record<string, number>;
  } | null;
}) {
  const [state, formAction, pending] = useActionState<ClubResult, FormData>(
    action,
    {},
  );
  const err = state.fieldErrors ?? {};

  return (
    <form action={formAction} className="mt-6 space-y-5">
      <fieldset>
        <legend className="block text-sm font-medium">
          How do you know this club?
        </legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {REVIEWER_ROLES.map(({ key, label }) => (
            <label
              key={key}
              className="cursor-pointer rounded-full border border-line px-3 py-1.5 text-sm has-[:checked]:border-brand has-[:checked]:bg-brand-soft has-[:checked]:font-medium has-[:checked]:text-brand-soft-text"
            >
              <input
                type="radio"
                name="reviewerRole"
                value={key}
                defaultChecked={existing?.reviewerRole === key}
                className="sr-only"
              />
              {label}
            </label>
          ))}
        </div>
        {err.reviewerRole && (
          <p className="mt-1 text-xs text-red-600">{err.reviewerRole}</p>
        )}
      </fieldset>

      <div className="rounded-xl border border-line bg-card p-4">
        <div className="divide-y divide-line">
          {RATING_CATEGORIES.map(({ key, label }) => (
            <StarPicker
              key={key}
              name={key}
              label={label}
              defaultValue={existing?.ratings[key]}
              error={err[key]}
            />
          ))}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium" htmlFor="title">
          Headline
        </label>
        <input
          id="title"
          name="title"
          defaultValue={existing?.title}
          placeholder="Great coaching, but limited playing time"
          className={`mt-1 ${field}`}
        />
        {err.title && <p className="mt-1 text-xs text-red-600">{err.title}</p>}
      </div>

      <div>
        <label className="block text-sm font-medium" htmlFor="body">
          Your experience
        </label>
        <textarea
          id="body"
          name="body"
          rows={7}
          defaultValue={existing?.body}
          placeholder="What was it like for your player? What would you tell a parent considering this club?"
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
          {pending ? "Posting…" : existing ? "Update review" : "Post review"}
        </button>
        {state.error && <span className="text-sm text-red-600">{state.error}</span>}
      </div>
    </form>
  );
}
