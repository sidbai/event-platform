"use client";

import { useActionState } from "react";

import type { TeamFormResult } from "./actions";
import { lockedBecause, policyFor, type Editor } from "./editable";

type Action = (prev: TeamFormResult, formData: FormData) => Promise<TeamFormResult>;

const field =
  "w-full rounded-md border border-line px-3 py-2 text-sm bg-card";
const label = "block text-sm font-medium";

export function TeamEditForm({
  action,
  clubs,
  admin = false,
  team,
}: {
  action: Action;
  clubs: { id: string; name: string }[];
  /** Admins may write everything; everyone else is bound by editable.ts. */
  admin?: boolean;
  team: {
    name: string;
    /** 'unknown' | 'club' | 'independent' — decides what belongs to the club. */
    affiliation: string;
    /** Already formatted — "2013/2014", or empty. */
    birthYears: string;
    tier: string;
    program: string;
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

  /*
   * The same rule the action enforces, asked here so the form does not offer
   * what the server will drop. A field somebody cannot write is shown and
   * disabled rather than hidden: the coach of the team is exactly the person
   * who should be told the club sets this, not left wondering where it went.
   */
  const editor: Editor = admin ? { kind: "admin" } : { kind: "claimant" };
  const may = (f: Parameters<typeof policyFor>[0]) =>
    policyFor(f, team, editor) === "free";
  const identityLocked = !may("club");

  return (
    <form action={formAction} className="mt-4 space-y-4">
      <div hidden={!may("name")}>
        <label className={label} htmlFor="name">
          Team name
        </label>
        <input
          id="name"
          name="name"
          defaultValue={team.name}
          disabled={!may("name")}
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

      {identityLocked && (
        <p className="rounded-md border border-line bg-elevated px-3 py-2 text-sm text-muted">
          {/* Said once, above the fields it applies to. A row of greyed-out
              inputs with no explanation reads as a broken page. */}
          What this team <em>is</em> &mdash; its club, birth years, gender, tier
          &mdash; belongs to the club, not to whoever runs it this season.{" "}
          {lockedBecause("club", team)}
        </p>
      )}

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
            disabled={identityLocked}
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
          <label className={label} htmlFor="birthYears">
            Birth years
          </label>
          <input
            id="birthYears"
            name="birthYears"
            defaultValue={team.birthYears}
            disabled={identityLocked}
            placeholder="2013/2014"
            className={`mt-1 ${field}`}
          />
          {state.fieldErrors?.birthYears ? (
            <p className="mt-1 text-xs text-red-600">{state.fieldErrors.birthYears}</p>
          ) : (
            /* Why this and not "U13": the age group is a fact about a season,
               and next season's U13 is a different set of children. */
            <p className="mt-1 text-xs text-muted">
              The years the players were born. Outlives the age group.
            </p>
          )}
        </div>

        <div>
          <label className={label} htmlFor="tier">
            Tier
          </label>
          <input
            id="tier"
            name="tier"
            defaultValue={team.tier}
            disabled={identityLocked}
            placeholder="ECNL 1, RCL 2, MLS Next"
            className={`mt-1 ${field}`}
          />
        </div>

        <div>
          <label className={label} htmlFor="program">
            Program
          </label>
          <input
            id="program"
            name="program"
            defaultValue={team.program}
            disabled={identityLocked}
            placeholder="Select, Academy, Shoreline"
            className={`mt-1 ${field}`}
          />
          {/* Named for what the club calls it, because that is what tells one
              of its teams from another — Seattle United's Shoreline side is
              its select team under the branch's name. */}
          <p className="mt-1 text-xs text-muted">
            The club&rsquo;s own stream, or its branch.
          </p>
        </div>

        <div>
          <label className={label} htmlFor="city">
            City
          </label>
          <input
            id="city"
            name="city"
            defaultValue={team.city ?? ""}
            disabled={identityLocked}
            className={`mt-1 ${field}`}
          />
        </div>
        <div>
          <label className={label} htmlFor="ageGroup">
            Age group
          </label>
          <input
            id="ageGroup"
            name="ageGroup"
            defaultValue={team.ageGroup ?? ""}
            disabled={identityLocked}
            placeholder="U11"
            className={`mt-1 ${field}`}
          />
        </div>
        <div>
          <label className={label} htmlFor="gender">
            Gender
          </label>
          <select
            id="gender"
            name="gender"
            defaultValue={team.gender ?? ""}
            disabled={identityLocked}
            className={`mt-1 ${field}`}
          >
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
        {/* Disabled as well as hidden: a hidden fieldset still submits its
            controls, and while the action drops the field anyway, a form that
            sends a value nobody may write is a trap for the next reader. */}
        <fieldset disabled={!may("visibility")} hidden={!may("visibility")}>
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
