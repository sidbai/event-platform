"use client";

import { useState, useTransition } from "react";

import type { ActionResult } from "./actions";
import type { Decision } from "./slots";

/**
 * Yes or no, on one request.
 *
 * Both actions are bound on the server to this booking; nothing here names
 * an id. The buttons disable together while either is in flight, because
 * "confirm" and "decline" landing a second apart is the one race a coach
 * would never notice and a parent would.
 */
export function DecisionButtons({
  decide,
}: {
  decide: (decision: Decision) => Promise<ActionResult>;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const go = (d: Decision) =>
    start(async () => {
      const out = await decide(d);
      setError(out.error ?? null);
    });
  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() => go("confirmed")}
        className="rounded-md bg-brand px-3 py-1 text-xs font-semibold text-on-brand hover:bg-brand-strong disabled:opacity-50"
      >
        Confirm
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() => go("declined")}
        className="rounded-md border border-line px-3 py-1 text-xs font-medium hover:bg-elevated disabled:opacity-50"
      >
        Decline
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </span>
  );
}

/** One button that does one irreversible-looking thing, with a confirm step. */
export function ConfirmButton({
  label,
  busy,
  action,
  danger = false,
}: {
  label: string;
  busy: string;
  action: () => Promise<ActionResult>;
  danger?: boolean;
}) {
  const [pending, start] = useTransition();
  const [armed, setArmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!armed) {
    return (
      <button
        type="button"
        onClick={() => setArmed(true)}
        className={`text-xs ${danger ? "text-red-600" : "text-brand-text"} hover:underline`}
      >
        {label}
      </button>
    );
  }
  return (
    <span className="inline-flex items-center gap-2 text-xs">
      <span className="text-muted">Sure?</span>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const out = await action();
            setError(out.error ?? null);
            if (out.ok) setArmed(false);
          })
        }
        className={`font-medium ${danger ? "text-red-600" : "text-brand-text"} hover:underline disabled:opacity-50`}
      >
        {pending ? busy : "Yes"}
      </button>
      <button type="button" onClick={() => setArmed(false)} className="text-muted hover:underline">
        No
      </button>
      {error && <span className="text-red-600">{error}</span>}
    </span>
  );
}
