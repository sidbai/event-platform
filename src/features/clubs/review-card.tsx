"use client";

import { useState } from "react";

import { REPORT_REASONS } from "./constants";

export function HelpfulButton({
  count,
  voted,
  action,
}: {
  count: number;
  voted: boolean;
  action: () => Promise<void>;
}) {
  return (
    <form action={action}>
      <button
        type="submit"
        className={
          voted
            ? "rounded-full border border-brand/50 bg-brand-soft px-3 py-1 text-xs font-medium text-brand-soft-text"
            : "rounded-full border border-line px-3 py-1 text-xs text-muted hover:bg-elevated"
        }
      >
        Helpful{count > 0 && ` · ${count}`}
      </button>
    </form>
  );
}

/**
 * Reporting is folded away until asked for: it should be available on every
 * review without being the most prominent thing on one.
 */
export function ReportControl({
  action,
  reported,
}: {
  action: (formData: FormData) => Promise<void>;
  reported: boolean;
}) {
  const [open, setOpen] = useState(false);

  if (reported) return <span className="text-xs text-muted">Reported</span>;

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
      <select
        name="reason"
        defaultValue={REPORT_REASONS[0]}
        className="rounded-md border border-line bg-card px-2 py-1 text-xs"
      >
        {REPORT_REASONS.map((r) => (
          <option key={r} value={r}>
            {r}
          </option>
        ))}
      </select>
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
