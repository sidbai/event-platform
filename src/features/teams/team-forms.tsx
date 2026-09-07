"use client";

import { useActionState } from "react";

import type { TeamFormResult } from "./actions";

type Action = (prev: TeamFormResult, formData: FormData) => Promise<TeamFormResult>;

const field =
  "w-full rounded-md border border-line px-3 py-2 text-sm bg-card";
const label = "block text-sm font-medium";

export function TeamEditForm({
  action,
  clubs,
  team,
}: {
  action: Action;
  clubs: { id: string; name: string }[];
  team: {
    name: string;
    visibility: string;
    /** The chosen club's id, or "independent", or "" for not said. */
    club: string;
    city: string | null;
    ageGroup: string | null;
    gender: string | null;
    bio: string | null;
  };
}) {
  const [state, formAction, pending] = useActionState<TeamFormResult, FormData>(
    action,
    {},
  );

  return (
    <form action={formAction} className="mt-4 space-y-4">
      <div>
        <label className={label} htmlFor="name">
          Team name
        </label>
        <input
          id="name"
          name="name"
          defaultValue={team.name}
          className={`mt-1 ${field}`}
        />
        {state.fieldErrors?.name && (
          <p className="mt-1 text-xs text-red-600">{state.fieldErrors.name}</p>
        )}
        {/* Said once, here, because the address is the thing people have
            already shared and a rename leaving it behind looks like a bug
            unless you know it is deliberate. */}
        <p className="mt-1 text-xs text-muted">
          The team&rsquo;s web address stays the same, so existing links keep
          working.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={label} htmlFor="club">
            Club
          </label>
          {/* A choice rather than a text box: the club is a page on this site
              with its own coaches and reviews, and "Crossfire", "XF" and
              "Crossfire Select" typed into a field are three clubs that do not
              exist. A team formed for a tournament says so instead. */}
          <select
            id="club"
            name="club"
            defaultValue={team.club}
            className={`mt-1 ${field}`}
          >
            <option value="">Not sure yet</option>
            <option value="independent">Not with a club</option>
            {clubs.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={label} htmlFor="city">
            City
          </label>
          <input id="city" name="city" defaultValue={team.city ?? ""} className={`mt-1 ${field}`} />
        </div>
        <div>
          <label className={label} htmlFor="ageGroup">
            Age group
          </label>
          <input
            id="ageGroup"
            name="ageGroup"
            defaultValue={team.ageGroup ?? ""}
            placeholder="U11"
            className={`mt-1 ${field}`}
          />
        </div>
        <div>
          <label className={label} htmlFor="gender">
            Gender
          </label>
          <select id="gender" name="gender" defaultValue={team.gender ?? ""} className={`mt-1 ${field}`}>
            <option value="">Any / coed</option>
            <option value="boys">Boys</option>
            <option value="girls">Girls</option>
            <option value="coed">Coed</option>
          </select>
        </div>
      </div>
      <div>
        <label className={label} htmlFor="bio">
          About
        </label>
        <textarea id="bio" name="bio" rows={3} defaultValue={team.bio ?? ""} className={`mt-1 ${field}`} />
      </div>
      <div className="flex items-center gap-3">
        <fieldset>
          <legend className="block text-sm font-medium">Who can see it</legend>
          <div className="mt-2 space-y-1 text-sm">
            <label className="flex items-start gap-2">
              <input
                type="radio"
                name="visibility"
                value="public"
                defaultChecked={team.visibility !== "private"}
                className="mt-1"
              />
              <span>
                Public
                <span className="block text-muted">Listed in the directory.</span>
              </span>
            </label>
            <label className="flex items-start gap-2">
              <input
                type="radio"
                name="visibility"
                value="private"
                defaultChecked={team.visibility === "private"}
                className="mt-1"
              />
              <span>
                Private
                <span className="block text-muted">
                  Not listed, and only members can open it.
                </span>
              </span>
            </label>
          </div>
        </fieldset>

        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-on-brand hover:bg-brand-strong disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save"}
        </button>
        {state.error && <span className="text-sm text-red-600">{state.error}</span>}
        {state.ok && <span className="text-sm text-brand-text">Saved.</span>}
      </div>
    </form>
  );
}


export function TransferOwnerForm({
  action,
}: {
  action: (
    prev: { error?: string; ok?: boolean },
    formData: FormData,
  ) => Promise<{ error?: string; ok?: boolean }>;
}) {
  const [state, formAction, pending] = useActionState(action, {});

  return (
    <form action={formAction} className="mt-3">
      <div className="flex flex-wrap gap-2">
        <input
          name="who"
          placeholder="@username or email@example.com"
          className="min-w-0 flex-1 rounded-md border border-line bg-card px-3 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded-md border border-line px-4 py-2 text-sm font-medium hover:bg-elevated disabled:opacity-50"
        >
          {pending ? "Transferring…" : "Transfer"}
        </button>
      </div>
      {state.error && <p className="mt-2 text-sm text-red-600">{state.error}</p>}
      {state.ok && (
        <p className="mt-2 text-sm text-brand-text">
          Done — they own the team now, and you stay on as a manager.
        </p>
      )}
    </form>
  );
}
