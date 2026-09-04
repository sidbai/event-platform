"use client";

import { useActionState } from "react";

import type { InviteResult } from "./invite-actions";

type Action = (prev: InviteResult, formData: FormData) => Promise<InviteResult>;

export function InviteForm({ action }: { action: Action }) {
  const [state, formAction, pending] = useActionState<InviteResult, FormData>(
    action,
    {},
  );

  return (
    <form action={formAction} className="mt-4">
      <div className="flex flex-wrap gap-2">
        <input
          name="who"
          placeholder="@username or email@example.com"
          className="min-w-0 flex-1 rounded-md border border-line bg-card px-3 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-on-brand hover:bg-brand-strong disabled:opacity-50"
        >
          {pending ? "Inviting…" : "Invite"}
        </button>
      </div>
      {state.error && <p className="mt-2 text-sm text-red-600">{state.error}</p>}
      {state.ok && <p className="mt-2 text-sm text-brand-text">{state.ok}</p>}
    </form>
  );
}

export function CopyLink({ url }: { url: string }) {
  return (
    <button
      type="button"
      onClick={() => navigator.clipboard?.writeText(url)}
      className="text-xs text-brand-text hover:underline"
      title={url}
    >
      Copy link
    </button>
  );
}
