"use client";

import Link from "next/link";
import { useActionState } from "react";

import type { RegistrationResult } from "./actions";

type Action = (
  prev: RegistrationResult,
  formData: FormData,
) => Promise<RegistrationResult>;

/**
 * Entering one team into one division.
 *
 * Rendered per division rather than once with a division picker, so the state
 * a team is already in shows against the division it applies to — a manager
 * with two teams in three divisions otherwise has to hold the grid in their
 * head.
 */
export function RegisterForm({
  action,
  divisionId,
  teams,
  existing,
  open,
  signedIn,
  signInHref,
}: {
  action: Action;
  divisionId: string;
  teams: { id: string; name: string; slug: string }[];
  /** Team id → what that team's entry is already doing here. */
  existing: Record<string, string>;
  open: boolean;
  signedIn: boolean;
  signInHref: string;
}) {
  const [state, formAction, pending] = useActionState<RegistrationResult, FormData>(
    action,
    {},
  );

  const entered = Object.entries(existing);
  const available = teams.filter((t) => !existing[t.id]);

  return (
    <div className="mt-3">
      {entered.length > 0 && (
        <ul className="mb-2 space-y-1 text-xs">
          {entered.map(([teamId, label]) => {
            const team = teams.find((t) => t.id === teamId);
            return (
              <li key={teamId} className="text-muted">
                <span className="font-medium text-ink">{team?.name}</span> — {label}
              </li>
            );
          })}
        </ul>
      )}

      {!open ? null : !signedIn ? (
        <Link href={signInHref} className="text-sm text-brand-text hover:underline">
          Sign in to enter a team
        </Link>
      ) : teams.length === 0 ? (
        <p className="text-xs text-muted">
          You don&rsquo;t manage a team yet.{" "}
          <Link href="/teams/new" className="text-brand-text hover:underline">
            Create one
          </Link>{" "}
          and it will show here.
        </p>
      ) : available.length === 0 ? (
        <p className="text-xs text-muted">
          Every team you manage is already entered here.
        </p>
      ) : (
        <form action={formAction} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="divisionId" value={divisionId} />
          <select
            name="teamId"
            className="rounded-md border border-line bg-card px-2 py-1.5 text-sm"
            aria-label="Team"
          >
            {available.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <input
            name="note"
            placeholder="Anything the organizer should know (optional)"
            className="min-w-48 flex-1 rounded-md border border-line bg-card px-2 py-1.5 text-sm"
          />
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-brand px-3 py-1.5 text-sm font-semibold text-on-brand hover:bg-brand-strong disabled:opacity-50"
          >
            {pending ? "Sending…" : "Request entry"}
          </button>
          {state.error && (
            <span className="w-full text-xs text-red-600">{state.error}</span>
          )}
        </form>
      )}
    </div>
  );
}
