"use client";

import { useActionState } from "react";

import { TIEBREAKERS, type Rules } from "./rules-input";
import { POINTS_SYSTEMS } from "./standings";
import type { SetupResult } from "./setup-actions";

const field = "rounded-md border border-line bg-card px-2 py-1.5 text-sm";
const labelCls = "block text-xs text-muted";

export function RulesForm({
  rules,
  action,
}: {
  rules: Rules | null;
  action: (prev: SetupResult, formData: FormData) => Promise<SetupResult>;
}) {
  const [state, formAction, pending] = useActionState<SetupResult, FormData>(action, {});

  // What was submitted wins over what is stored: React resets these inputs
  // once the action completes, so a rejected save would otherwise show the
  // stored rules beside an error about the ones the organizer typed.
  const v = (key: string, stored: string | number | undefined) =>
    state.values?.[key] ?? (stored == null ? "" : String(stored));
  const chosen = new Set(
    state.values?.tiebreakers !== undefined
      ? state.values.tiebreakers.split(",").filter(Boolean)
      : (rules?.tiebreakers ?? []),
  );

  return (
    <form action={formAction} className="mt-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={labelCls}>
          Game format
          <input
            name="gameFormat"
            defaultValue={v("gameFormat", rules?.gameFormat)}
            placeholder="9v9, size 4 ball"
            className={`mt-1 block w-full ${field}`}
          />
        </label>

        <div className="grid grid-cols-3 gap-3">
          <label className={`col-span-1 ${labelCls}`}>
            Periods
            <input
              name="periods"
              inputMode="numeric"
              defaultValue={v("periods", rules?.periods)}
              placeholder="2"
              className={`mt-1 block w-full ${field}`}
            />
          </label>
          <label className={`col-span-1 ${labelCls}`}>
            Minutes
            <input
              name="periodMinutes"
              inputMode="numeric"
              defaultValue={v("periodMinutes", rules?.periodMinutes)}
              placeholder="30"
              className={`mt-1 block w-full ${field}`}
            />
          </label>
          <label className={`col-span-1 ${labelCls}`}>
            Goal cap
            <input
              name="goalCap"
              inputMode="numeric"
              defaultValue={v("goalCap", rules?.goalCapPerGame)}
              placeholder="6"
              className={`mt-1 block w-full ${field}`}
            />
          </label>
        </div>

        <label className={labelCls}>
          Points
          <select
            name="pointsSystem"
            defaultValue={v("pointsSystem", rules?.pointsSystem) || "standard"}
            className={`mt-1 block w-full ${field}`}
          >
            {Object.values(POINTS_SYSTEMS).map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
          {/* Spelled out rather than left to the name: "ten-point" tells an
              organizer nothing about whether it is the one their tournament
              plays, and picking the wrong one reorders every table. */}
          <span className="mt-1 block text-xs text-muted">
            {POINTS_SYSTEMS.standard.describe} Ten-point:{" "}
            {POINTS_SYSTEMS["ten-point"].describe}
          </span>
        </label>

        <label className={labelCls}>
          Advancement
          <input
            name="advancement"
            defaultValue={v("advancement", rules?.advancement)}
            placeholder="Top two per group reach the semifinal"
            className={`mt-1 block w-full ${field}`}
          />
        </label>

        <label className={labelCls}>
          Roster rules
          <input
            name="roster"
            defaultValue={v("roster", rules?.roster)}
            placeholder="16 players max, 3 guest players"
            className={`mt-1 block w-full ${field}`}
          />
        </label>
      </div>

      <fieldset className="mt-4">
        <legend className="text-xs text-muted">Tiebreakers</legend>
        <p className="mt-1 text-xs text-muted">
          Applied in this order, top to bottom. Anything still level after the
          last one is decided by the organizer.
        </p>
        <div className="mt-2 space-y-1">
          {TIEBREAKERS.map((t) => (
            <label key={t.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="tiebreakers"
                value={t.id}
                defaultChecked={chosen.has(t.id)}
              />
              {t.label}
            </label>
          ))}
        </div>
      </fieldset>

      {state.error && <p className="mt-3 text-xs text-red-600">{state.error}</p>}
      {state.ok && <p className="mt-3 text-xs text-brand-text">Rules saved.</p>}

      <button
        type="submit"
        disabled={pending}
        className="mt-4 rounded-md bg-brand px-3 py-1.5 text-sm font-semibold text-on-brand hover:bg-brand-strong disabled:opacity-50"
      >
        {pending ? "Saving…" : "Save rules"}
      </button>
    </form>
  );
}
