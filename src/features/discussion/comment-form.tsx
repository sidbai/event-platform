"use client";

import { useActionState, useRef } from "react";

import type { FormResult } from "./actions";

type Action = (prev: FormResult, formData: FormData) => Promise<FormResult>;

export function CommentForm({
  action,
  parentId,
  placeholder = "Add a comment…",
  compact = false,
  onDone,
}: {
  action: Action;
  parentId?: string;
  placeholder?: string;
  compact?: boolean;
  onDone?: () => void;
}) {
  const [state, formAction, pending] = useActionState<FormResult, FormData>(
    async (prev, formData) => {
      const result = await action(prev, formData);
      if (result.ok) {
        formRef.current?.reset();
        onDone?.();
      }
      return result;
    },
    {},
  );
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form ref={formRef} action={formAction} className="space-y-2">
      {parentId && <input type="hidden" name="parentId" value={parentId} />}
      <textarea
        name="body"
        required
        rows={compact ? 2 : 3}
        placeholder={placeholder}
        className="w-full resize-y rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
      />
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
        >
          {pending ? "Posting…" : compact ? "Reply" : "Post"}
        </button>
        {state.error && <span className="text-sm text-red-600 dark:text-red-400">{state.error}</span>}
      </div>
    </form>
  );
}
