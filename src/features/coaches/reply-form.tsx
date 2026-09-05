"use client";

import { useActionState, useState } from "react";

import type { ReviewResult } from "@/features/reviews/constants";

type Action = (prev: ReviewResult, formData: FormData) => Promise<ReviewResult>;

/**
 * The coach's answer to one review, written in place under it.
 *
 * Folded away until used so an unanswered review doesn't look like it is
 * waiting for something.
 */
export function ReplyForm({
  action,
  existing,
}: {
  action: Action;
  existing?: string | null;
}) {
  const [state, formAction, pending] = useActionState<ReviewResult, FormData>(
    action,
    {},
  );
  const [open, setOpen] = useState(false);

  if (!open && !existing) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs font-medium text-brand-text hover:underline"
      >
        Respond to this review
      </button>
    );
  }

  if (!open && existing) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs text-muted hover:text-ink"
      >
        Edit your response
      </button>
    );
  }

  return (
    <form action={formAction} className="w-full space-y-2">
      <textarea
        name="body"
        rows={4}
        defaultValue={existing ?? ""}
        placeholder="Your response is public and shown under this review, with your name."
        className="w-full rounded-md border border-line bg-card px-3 py-2 text-sm"
      />
      {state.fieldErrors?.body && (
        <p className="text-xs text-red-600">{state.fieldErrors.body}</p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-brand px-3 py-1.5 text-xs font-semibold text-on-brand hover:bg-brand-strong disabled:opacity-50"
        >
          {pending ? "Posting…" : "Post response"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-xs text-muted hover:text-ink"
        >
          Cancel
        </button>
        {state.error && <span className="text-xs text-red-600">{state.error}</span>}
        {state.ok && <span className="text-xs text-brand-text">Posted.</span>}
      </div>
    </form>
  );
}

/** The "is this you?" request. Hidden behind a link until asked for. */
export function ClaimForm({ action }: { action: Action }) {
  const [state, formAction, pending] = useActionState<ReviewResult, FormData>(
    action,
    {},
  );
  const [open, setOpen] = useState(false);

  if (state.ok) {
    return (
      <p className="mt-3 rounded-md bg-elevated px-3 py-2 text-sm text-muted">
        Request sent. An admin will check it before you can respond to reviews.
      </p>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-3 text-sm text-brand-text hover:underline"
      >
        Is this you? Claim this page
      </button>
    );
  }

  return (
    <form action={formAction} className="mt-3 space-y-2 rounded-lg border border-line bg-card p-4">
      <p className="text-sm font-medium">Claim this page</p>
      <p className="text-xs text-muted">
        Claiming lets you respond publicly to reviews about you. It does not let
        you edit or remove them. An admin checks every request.
      </p>
      <textarea
        name="note"
        rows={3}
        placeholder="How can we tell it's you? A club email, a page that lists you, anything we can check."
        className="w-full rounded-md border border-line bg-card px-3 py-2 text-sm"
      />
      {state.fieldErrors?.note && (
        <p className="text-xs text-red-600">{state.fieldErrors.note}</p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-brand px-3 py-1.5 text-xs font-semibold text-on-brand hover:bg-brand-strong disabled:opacity-50"
        >
          {pending ? "Sending…" : "Send request"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-xs text-muted hover:text-ink"
        >
          Cancel
        </button>
        {state.error && <span className="text-xs text-red-600">{state.error}</span>}
      </div>
    </form>
  );
}
