"use client";

import { useActionState, useState } from "react";

import { CreateButton } from "@/components/create-link";

import { TASK_CATEGORIES } from "./checklist";
import type { ChecklistResult } from "./checklist-actions";

const field = "rounded-md border border-line bg-card px-2 py-1.5 text-sm";
const labelCls = "block text-xs text-muted";

export function AddTaskForm({
  action,
}: {
  action: (prev: ChecklistResult, formData: FormData) => Promise<ChecklistResult>;
}) {
  const [state, formAction, pending] = useActionState<ChecklistResult, FormData>(
    action,
    {},
  );
  const [open, setOpen] = useState(false);

  // Collapse once it lands, so adding several in a row does not leave a stack
  // of spent forms behind. Adjusted against the previous value during render
  // rather than in an effect.
  const [sawOk, setSawOk] = useState(false);
  if (Boolean(state.ok) !== sawOk) {
    setSawOk(Boolean(state.ok));
    if (state.ok) setOpen(false);
  }

  if (!open) {
    return (
      <CreateButton onClick={() => setOpen(true)} className="mt-4">
        Add a task
      </CreateButton>
    );
  }

  return (
    <form action={formAction} className="mt-4 rounded-lg border border-line p-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={labelCls}>
          What needs doing
          <input
            name="title"
            required
            placeholder="Confirm the referee assignor"
            className={`mt-1 block w-full ${field}`}
          />
        </label>

        <label className={labelCls}>
          Category
          <select name="category" defaultValue="other" className={`mt-1 block w-full ${field}`}>
            {TASK_CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </label>

        <label className={labelCls}>
          Who
          <input
            name="owner"
            placeholder="Marta"
            className={`mt-1 block w-full ${field}`}
          />
        </label>

        <label className={labelCls}>
          Due
          <input type="datetime-local" name="dueAt" className={`mt-1 block w-full ${field}`} />
        </label>
      </div>

      <label className={`mt-3 ${labelCls}`}>
        Notes <span className="text-muted">(optional)</span>
        <input name="detail" className={`mt-1 block w-full ${field}`} />
      </label>

      {state.error && <p className="mt-2 text-xs text-red-600">{state.error}</p>}

      <div className="mt-3 flex gap-3 text-sm">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-brand px-3 py-1.5 font-semibold text-on-brand hover:bg-brand-strong disabled:opacity-50"
        >
          {pending ? "Adding…" : "Add task"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-muted hover:text-ink"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
