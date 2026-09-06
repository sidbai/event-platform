"use client";

import { useActionState } from "react";

import { endDateHint } from "@/features/events/when";

import type { SetupResult } from "./setup-actions";

const field = "rounded-md border border-line bg-card px-2 py-1.5 text-sm";
const labelCls = "block text-xs text-muted";

export function DatesForm({
  kind,
  date,
  time,
  endDate,
  action,
}: {
  kind: string;
  /** Already rendered in the event's own timezone by the page. */
  date: string;
  time: string;
  endDate: string;
  action: (prev: SetupResult, formData: FormData) => Promise<SetupResult>;
}) {
  const [state, formAction, pending] = useActionState<SetupResult, FormData>(action, {});
  const v = (key: string, stored: string) => state.values?.[key] ?? stored;

  return (
    <form action={formAction} className="mt-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <label className={labelCls}>
          First day
          <input
            type="date"
            name="date"
            required
            defaultValue={v("date", date)}
            className={`mt-1 block w-full ${field}`}
          />
        </label>
        <label className={labelCls}>
          Start time
          <input
            type="time"
            name="time"
            defaultValue={v("time", time)}
            className={`mt-1 block w-full ${field}`}
          />
        </label>
        <label className={labelCls}>
          Last day
          <input
            type="date"
            name="endDate"
            defaultValue={v("endDate", endDate)}
            className={`mt-1 block w-full ${field}`}
          />
        </label>
      </div>

      <p className="mt-2 text-xs text-muted">{endDateHint(kind)}</p>

      {state.error && <p className="mt-2 text-xs text-red-600">{state.error}</p>}
      {state.ok && <p className="mt-2 text-xs text-brand-text">Dates saved.</p>}

      <button
        type="submit"
        disabled={pending}
        className="mt-3 rounded-md bg-brand px-3 py-1.5 text-sm font-semibold text-on-brand hover:bg-brand-strong disabled:opacity-50"
      >
        {pending ? "Saving…" : "Save dates"}
      </button>
    </form>
  );
}
