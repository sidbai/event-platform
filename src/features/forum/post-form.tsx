"use client";

import { useActionState } from "react";

import { CATEGORY_LABELS, FORUM_CATEGORIES, type ForumResult } from "./constants";

type Action = (prev: ForumResult, formData: FormData) => Promise<ForumResult>;

const field =
  "w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900";

export function PostForm({
  action,
  defaultCategory = "general",
}: {
  action: Action;
  defaultCategory?: string;
}) {
  const [state, formAction, pending] = useActionState<ForumResult, FormData>(
    action,
    {},
  );
  const err = state.fieldErrors ?? {};

  return (
    <form action={formAction} className="mt-6 space-y-4">
      <div>
        <input
          name="title"
          placeholder="Title"
          className={`${field} text-base font-medium`}
          autoFocus
        />
        {err.title && <p className="mt-1 text-xs text-red-600">{err.title}</p>}
      </div>

      <div>
        <select
          name="category"
          defaultValue={defaultCategory}
          className={`${field} sm:max-w-xs`}
        >
          {FORUM_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {CATEGORY_LABELS[c]}
            </option>
          ))}
        </select>
      </div>

      <div>
        <textarea
          name="body"
          rows={8}
          placeholder="What&rsquo;s on your mind?"
          className={field}
        />
        {err.body && <p className="mt-1 text-xs text-red-600">{err.body}</p>}
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
        >
          {pending ? "Posting…" : "Post"}
        </button>
        {state.error && <span className="text-sm text-red-600">{state.error}</span>}
      </div>
    </form>
  );
}
