"use client";

import { useActionState } from "react";

import { PROFILE_TAGS, TAG_LABELS, type ProfileResult } from "./constants";

type Action = (prev: ProfileResult, formData: FormData) => Promise<ProfileResult>;

type Profile = {
  username: string | null;
  displayName: string | null;
  name: string | null;
  tags: string[];
  club: string | null;
  city: string | null;
  bio: string | null;
};

const field =
  "w-full rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900";
const label = "block text-sm font-medium";

export function SettingsForm({
  action,
  profile,
}: {
  action: Action;
  profile: Profile;
}) {
  const [state, formAction, pending] = useActionState<ProfileResult, FormData>(
    action,
    {},
  );
  const err = state.fieldErrors ?? {};

  return (
    <form action={formAction} className="mt-6 space-y-5">
      <div>
        <label className={label} htmlFor="username">
          Username
        </label>
        <div className="mt-1 flex items-center gap-1">
          <span className="text-sm text-neutral-400">@</span>
          <input
            id="username"
            name="username"
            defaultValue={profile.username ?? ""}
            className={field}
            autoCapitalize="none"
            spellCheck={false}
          />
        </div>
        <p className="mt-1 text-xs text-neutral-400">
          Letters, numbers and underscores. Your profile is at /people/username.
        </p>
        {err.username && <p className="mt-1 text-xs text-red-600">{err.username}</p>}
      </div>

      <div>
        <label className={label} htmlFor="displayName">
          Display name
        </label>
        <input
          id="displayName"
          name="displayName"
          defaultValue={profile.displayName ?? profile.name ?? ""}
          placeholder="Shown on your comments and teams"
          className={`mt-1 ${field}`}
        />
        {err.displayName && (
          <p className="mt-1 text-xs text-red-600">{err.displayName}</p>
        )}
      </div>

      <fieldset>
        <legend className={label}>I&rsquo;m a&hellip;</legend>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
          {PROFILE_TAGS.map((tag) => (
            <label key={tag} className="flex items-center gap-1.5 text-sm">
              <input
                type="checkbox"
                name={`tag_${tag}`}
                defaultChecked={profile.tags.includes(tag)}
              />
              {TAG_LABELS[tag]}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={label} htmlFor="club">
            Club <span className="text-neutral-400">(optional)</span>
          </label>
          <input id="club" name="club" defaultValue={profile.club ?? ""} className={`mt-1 ${field}`} />
        </div>
        <div>
          <label className={label} htmlFor="city">
            City <span className="text-neutral-400">(optional)</span>
          </label>
          <input id="city" name="city" defaultValue={profile.city ?? ""} className={`mt-1 ${field}`} />
        </div>
      </div>

      <div>
        <label className={label} htmlFor="bio">
          About <span className="text-neutral-400">(optional)</span>
        </label>
        <textarea id="bio" name="bio" rows={3} defaultValue={profile.bio ?? ""} className={`mt-1 ${field}`} />
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save"}
        </button>
        {state.error && <span className="text-sm text-red-600">{state.error}</span>}
        {state.ok && <span className="text-sm text-emerald-600 dark:text-emerald-400">Saved.</span>}
      </div>
    </form>
  );
}
