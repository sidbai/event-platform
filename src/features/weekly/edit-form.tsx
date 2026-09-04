"use client";

import { useActionState } from "react";

type Result = { error?: string; ok?: boolean };
type FeaturedEvent = { id: string; title: string };

export function WeeklyEditForm({
  action,
  title,
  intro,
  events,
}: {
  action: (prev: Result, formData: FormData) => Promise<Result>;
  title: string;
  intro: string;
  events: FeaturedEvent[];
}) {
  const [state, formAction, pending] = useActionState<Result, FormData>(action, {});

  return (
    <form action={formAction} className="mt-6 space-y-4">
      <div>
        <label className="block text-sm font-medium" htmlFor="title">
          Title
        </label>
        <input
          id="title"
          name="title"
          defaultValue={title}
          className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
        />
      </div>
      <div>
        <label className="block text-sm font-medium" htmlFor="intro">
          Intro
        </label>
        <textarea
          id="intro"
          name="intro"
          rows={4}
          defaultValue={intro}
          className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
        />
      </div>
      <fieldset>
        <legend className="text-sm font-medium">Featured events</legend>
        <div className="mt-2 space-y-1">
          {events.map((event) => (
            <label key={event.id} className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="keep" value={event.id} defaultChecked />
              {event.title}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save"}
        </button>
        {state.error && <span className="text-sm text-red-600">{state.error}</span>}
        {state.ok && <span className="text-sm text-emerald-700 dark:text-emerald-400">Saved.</span>}
      </div>
    </form>
  );
}
