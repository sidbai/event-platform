"use client";

import { useActionState, useRef, useState } from "react";

import type { MessageResult } from "./actions";

type Action = (prev: MessageResult, formData: FormData) => Promise<MessageResult>;

const field = "w-full rounded-md border border-line bg-card px-3 py-2 text-sm";

export function MessageComposer({
  action,
  placeholder,
  submitLabel,
}: {
  action: Action;
  placeholder: string;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState<MessageResult, FormData>(
    action,
    {},
  );
  const ref = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={ref}
      action={async (fd) => {
        await formAction(fd);
        ref.current?.reset();
      }}
      className="mt-4 space-y-2"
    >
      <textarea
        name="body"
        rows={3}
        placeholder={placeholder}
        className={field}
      />
      {state.fieldErrors?.body && (
        <p className="text-xs text-red-600">{state.fieldErrors.body}</p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-on-brand hover:bg-brand-strong disabled:opacity-50"
        >
          {pending ? "Sending…" : submitLabel}
        </button>
        {state.error && <span className="text-sm text-red-600">{state.error}</span>}
      </div>
    </form>
  );
}

/** Opens the composer only when asked, so the page isn't a message box. */
export function ContactButton({
  action,
  label,
  placeholder,
}: {
  action: Action;
  label: string;
  placeholder: string;
}) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md border border-line px-3 py-1.5 text-sm hover:bg-elevated"
      >
        {label}
      </button>
    );
  }

  return (
    <div className="w-full rounded-lg border border-line bg-card p-4">
      <p className="text-sm font-medium">{label}</p>
      <MessageComposer
        action={action}
        placeholder={placeholder}
        submitLabel="Send"
      />
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="mt-2 text-xs text-muted hover:text-ink"
      >
        Cancel
      </button>
    </div>
  );
}

/** Report control for one message, folded away until used. */
export function ReportMessage({
  action,
}: {
  action: (formData: FormData) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs text-muted hover:text-red-600"
      >
        Report
      </button>
    );
  }

  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input
        name="reason"
        placeholder="What's wrong with it?"
        className="rounded-md border border-line bg-card px-2 py-1 text-xs"
      />
      <button type="submit" className="text-xs font-medium text-red-600 hover:underline">
        Send
      </button>
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="text-xs text-muted hover:text-ink"
      >
        Cancel
      </button>
    </form>
  );
}
