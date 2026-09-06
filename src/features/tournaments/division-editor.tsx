"use client";

import { useActionState, useState } from "react";

import { CreateButton } from "@/components/create-link";
import { formatFee } from "@/features/registration/openness";

import { GAME_FORMATS, toLocalInput } from "./division-input";
import type { SetupResult } from "./setup-actions";

export type DivisionRow = {
  id: string;
  name: string;
  label: string | null;
  birthYears: number[];
  format: string | null;
  rosterMin: number | null;
  rosterMax: number | null;
  feeCents: number | null;
  capacity: number | null;
  registrationOpensAt: Date | null;
  registrationClosesAt: Date | null;
  /** Filled places, so the summary says how the division is doing. */
  acceptedCount: number;
};

type SaveAction = (prev: SetupResult, formData: FormData) => Promise<SetupResult>;
type DeleteAction = (divisionId: string) => Promise<SetupResult>;

const field = "rounded-md border border-line bg-card px-2 py-1.5 text-sm";
const labelCls = "block text-xs text-muted";

/**
 * The fields of a division, shared by the add and edit forms.
 *
 * One set of inputs rather than two that drift: the edit form growing a field
 * the add form lacks is how a division ends up only half-configurable
 * depending on which door you came in by.
 */
function DivisionFields({
  division,
  values,
  timeZone,
}: {
  division?: DivisionRow;
  /** What was submitted, when a save came back rejected. */
  values?: Record<string, string>;
  timeZone: string;
}) {
  // What the organizer typed wins over what is stored: after a rejected save
  // React has reset these inputs, and showing the stored value beside an error
  // about the typed one is how a form argues with itself.
  const v = (key: string, stored: string | number | null | undefined) =>
    values?.[key] ?? (stored == null ? "" : String(stored));

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <label className={labelCls}>
        Name
        <input
          name="name"
          required
          defaultValue={v("name", division?.name)}
          placeholder="B2013 Premier"
          className={`mt-1 block w-full ${field}`}
        />
      </label>

      <label className={labelCls}>
        Display label <span className="text-muted">(optional)</span>
        <input
          name="label"
          defaultValue={v("label", division?.label)}
          placeholder="Boys 2013 — Premier"
          className={`mt-1 block w-full ${field}`}
        />
      </label>

      <label className={labelCls}>
        Birth years
        <input
          name="birthYears"
          defaultValue={v("birthYears", division?.birthYears.join("/"))}
          placeholder="2013/2014"
          className={`mt-1 block w-full ${field}`}
        />
      </label>

      <label className={labelCls}>
        Format
        <select
          name="format"
          defaultValue={v("format", division?.format)}
          className={`mt-1 block w-full ${field}`}
        >
          <option value="">Not set</option>
          {GAME_FORMATS.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className={labelCls}>
          Roster min
          <input
            name="rosterMin"
            inputMode="numeric"
            defaultValue={v("rosterMin", division?.rosterMin)}
            className={`mt-1 block w-full ${field}`}
          />
        </label>
        <label className={labelCls}>
          Roster max
          <input
            name="rosterMax"
            inputMode="numeric"
            defaultValue={v("rosterMax", division?.rosterMax)}
            className={`mt-1 block w-full ${field}`}
          />
        </label>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className={labelCls}>
          Entry fee
          <input
            name="fee"
            inputMode="decimal"
            defaultValue={v("fee", division?.feeCents != null ? (division.feeCents / 100).toFixed(2) : null)}
            placeholder="Free"
            className={`mt-1 block w-full ${field}`}
          />
        </label>
        <label className={labelCls}>
          Team limit
          <input
            name="capacity"
            inputMode="numeric"
            defaultValue={v("capacity", division?.capacity)}
            placeholder="No cap"
            className={`mt-1 block w-full ${field}`}
          />
        </label>
      </div>

      <label className={labelCls}>
        Entries open
        <input
          type="datetime-local"
          name="opensAt"
          defaultValue={v("opensAt", toLocalInput(division?.registrationOpensAt ?? null, timeZone))}
          className={`mt-1 block w-full ${field}`}
        />
      </label>

      <label className={labelCls}>
        Entries close
        <input
          type="datetime-local"
          name="closesAt"
          defaultValue={v("closesAt", toLocalInput(division?.registrationClosesAt ?? null, timeZone))}
          className={`mt-1 block w-full ${field}`}
        />
      </label>
    </div>
  );
}

/** What a division says about itself when it is not being edited. */
function summarise(d: DivisionRow): string {
  return [
    d.format,
    d.birthYears.length > 0 ? `born ${d.birthYears.join("/")}` : null,
    formatFee(d.feeCents),
    // Entries accepted, not teams playing. They are usually the same number,
    // but an event whose teams were entered by hand has none of the former and
    // plenty of the latter, and "0 teams" beside a full schedule reads as a bug.
    d.capacity !== null
      ? `${d.acceptedCount} of ${d.capacity} entries accepted`
      : `${d.acceptedCount} entries accepted`,
    d.rosterMin || d.rosterMax
      ? `roster ${d.rosterMin ?? "?"}–${d.rosterMax ?? "?"}`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

function DivisionItem({
  division,
  timeZone,
  save,
  remove,
}: {
  division: DivisionRow;
  timeZone: string;
  save: SaveAction;
  remove: DeleteAction;
}) {
  const [state, formAction, pending] = useActionState<SetupResult, FormData>(save, {});
  const [editing, setEditing] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);

  // Collapse on a successful save, not on submit: staying open through an
  // error is what lets the organizer see what was wrong and fix it in place.
  //
  // Adjusted during render against the previous value rather than in an
  // effect, which React supports for exactly this — deriving state from a
  // prop that changed — and which avoids the extra render an effect costs.
  const [sawOk, setSawOk] = useState(false);
  if (Boolean(state.ok) !== sawOk) {
    setSawOk(Boolean(state.ok));
    if (state.ok) setEditing(false);
  }

  if (!editing) {
    return (
      <li className="flex flex-wrap items-baseline justify-between gap-2 py-3">
        <div className="min-w-0">
          <div className="font-medium">{division.label ?? division.name}</div>
          <div className="text-xs text-muted">{summarise(division)}</div>
          {removeError && (
            <p className="mt-1 text-xs text-red-600">{removeError}</p>
          )}
        </div>
        <div className="flex gap-3 text-xs">
          <button
            type="button"
            onClick={() => {
              // A refusal from a previous Remove should not outlive the row's
              // next edit; it describes a click the organizer has moved on from.
              setRemoveError(null);
              setEditing(true);
            }}
            className="font-medium text-brand-text hover:underline"
          >
            Edit
          </button>
          <button
            type="button"
            onClick={async () => {
              setRemoveError(null);
              const res = await remove(division.id);
              if (res.error) setRemoveError(res.error);
            }}
            className="text-muted hover:text-red-600"
          >
            Remove
          </button>
        </div>
      </li>
    );
  }

  return (
    <li className="py-3">
      <form action={formAction}>
        <input type="hidden" name="divisionId" value={division.id} />
        <DivisionFields division={division} values={state.values} timeZone={timeZone} />
        {state.error && <p className="mt-2 text-xs text-red-600">{state.error}</p>}
        <div className="mt-3 flex gap-3 text-sm">
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-brand px-3 py-1.5 font-semibold text-on-brand hover:bg-brand-strong disabled:opacity-50"
          >
            {pending ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="text-muted hover:text-ink"
          >
            Cancel
          </button>
        </div>
      </form>
    </li>
  );
}

function AddDivision({ timeZone, save }: { timeZone: string; save: SaveAction }) {
  const [state, formAction, pending] = useActionState<SetupResult, FormData>(save, {});
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <CreateButton onClick={() => setOpen(true)} className="mt-4">
        Add a division
      </CreateButton>
    );
  }

  return (
    <form action={formAction} className="mt-4 rounded-lg border border-line p-3">
      <p className="mb-3 text-sm font-medium">New division</p>
      <DivisionFields values={state.values} timeZone={timeZone} />
      {state.error && <p className="mt-2 text-xs text-red-600">{state.error}</p>}
      <div className="mt-3 flex gap-3 text-sm">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-brand px-3 py-1.5 font-semibold text-on-brand hover:bg-brand-strong disabled:opacity-50"
        >
          {pending ? "Adding…" : "Add division"}
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

export function DivisionEditor({
  divisions,
  timeZone,
  save,
  remove,
}: {
  divisions: DivisionRow[];
  timeZone: string;
  save: SaveAction;
  remove: DeleteAction;
}) {
  return (
    <div>
      {divisions.length === 0 ? (
        <p className="text-sm text-muted">
          No divisions yet. Teams enter a division, not the event, so nothing can
          be registered until there is at least one.
        </p>
      ) : (
        <ul className="divide-y divide-line">
          {divisions.map((d) => (
            <DivisionItem
              key={d.id}
              division={d}
              timeZone={timeZone}
              save={save}
              remove={remove}
            />
          ))}
        </ul>
      )}
      <AddDivision timeZone={timeZone} save={save} />
    </div>
  );
}
