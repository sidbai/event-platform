"use client";

import Link from "next/link";
import { useActionState } from "react";

import { draftKey } from "@/features/reviews/draft";
import { useFormDraft } from "@/features/reviews/use-form-draft";

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
  slug,
  signedIn,
  allowAnonymous,
}: {
  action: Action;
  existing?: {
    title: string;
    body: string;
    reviewerRole: string;
    ratings: Record<string, number>;
  } | null;
  /** Identifies the draft, so one club's review cannot restore under another. */
  slug: string;
  signedIn: boolean;
  /** Whether the server will accept a review with no account behind it. */
  allowAnonymous: boolean;
}) {
  const [state, formAction, pending] = useActionState<ClubResult, FormData>(
    action,
    {},
  );
  const err = state.fieldErrors ?? {};

  // Nothing to hold on to when editing: the posted review is already the draft.
  const {
    ref: formRef,
    save: saveDraft,
    clear: clearDraft,
  } = useFormDraft(draftKey("club", slug), !existing);

  return (
    <form
      ref={formRef}
      action={formAction}
      onSubmit={clearDraft}
      className="mt-6 space-y-5"
    >
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
        {signedIn ? (
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-on-brand hover:bg-brand-strong disabled:opacity-50"
          >
            {pending ? "Posting…" : existing ? "Update review" : "Post review"}
          </button>
        ) : allowAnonymous ? (
          /* No account needed. The captcha stands in for one, and the note
             below says what that costs the writer. */
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-on-brand hover:bg-brand-strong disabled:opacity-50"
          >
            {pending ? "Posting…" : existing ? "Update review" : "Post review"}
          </button>
        ) : (
          /* Anonymous posting is not configured, so an account is the only way
             through and the ask lands here, with the draft already saved. */
          <Link
            href={`/signin?next=${encodeURIComponent(`/clubs/${slug}/review`)}`}
            onClick={saveDraft}
            className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-on-brand hover:bg-brand-strong"
          >
            Sign in to post
          </Link>
        )}
        {state.error && <span className="text-sm text-red-600">{state.error}</span>}
      </div>

      {!signedIn &&
        (allowAnonymous ? (
          <div className="space-y-2">
            <p className="text-xs text-muted">
              Posting without an account. Readers never see who wrote a review
              either way — but an anonymous one can&rsquo;t be edited or taken
              down later, because there is nothing tying it to you.{" "}
              <Link
                href={`/signin?next=${encodeURIComponent(`/clubs/${slug}/review`)}`}
                onClick={saveDraft}
                className="text-brand-text hover:underline"
              >
                Sign in
              </Link>{" "}
              if you&rsquo;d rather keep that option. Your draft is kept either
              way.
            </p>
          </div>
        ) : (
          <p className="text-xs text-muted">
            Your draft is kept on this device — sign in and you will come back
            to it. Reviews are posted anonymously; readers never see your name.
          </p>
        ))}
    </form>
  );
}
